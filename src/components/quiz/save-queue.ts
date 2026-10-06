/**
 * The answer outbox. Framework-free so it's unit-tested with fake timers.
 *
 * - Keeps only the latest pick per question and debounces quick changes
 *   (multi-select toggles) into one write.
 * - Sends one request at a time.
 * - Retries network, 5xx and 429 failures at 1, 2, 4, 8, 16 and 30 s, then
 *   gives up (the entries stay queued; the UI offers Retry).
 * - Other 4xx errors are permanent: that entry is dropped and reported.
 * - Mirrors itself to sessionStorage so a reload or crash loses nothing, and
 *   can hand everything to navigator.sendBeacon when the page goes away.
 */
import { ApiError, type Answers, type SaveResponse } from "./api";

export type QueueEntry = { answerIds: number[]; currentIndex: number };

export const DEBOUNCE_MS = 250;
export const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
export const MAX_STORED_AGE_MS = 24 * 60 * 60 * 1000;

type Stored = { v: 1; savedAt: number; attemptNo: number | null; entries: [number, QueueEntry][] };

export type SaveQueueOptions = {
  send: (questionId: number, entry: QueueEntry, clientRevision: number) => Promise<SaveResponse>;
  /** A save succeeded. `overlay` is what's still queued (to keep on top of stale server answers). */
  onSaved: (res: SaveResponse, overlay: Answers) => void;
  /** Retries are exhausted; entries remain queued. */
  onGaveUp: (error: unknown) => void;
  /** A save was refused for good (e.g. 409 already submitted); that entry was dropped. */
  onDropped: (error: unknown, questionId: number) => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  storageKey?: string;
  now?: () => number;
};

/** Worth retrying: no response, a server error, or rate limiting. */
export function isRetriable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status >= 500 || error.status === 429;
}

function retryAfterMs(error: unknown): number {
  const seconds = error instanceof ApiError ? Number(error.details?.retryAfter) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export class SaveQueue {
  /** Latest server revision, sent as clientRevision. */
  revision = 0;
  /** The attempt these entries belong to (null before the first save). */
  attemptNo: number | null = null;

  private entries = new Map<number, QueueEntry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private failures = 0;
  /** A beacon already carries the current entries (pagehide and visibilitychange both fire on exit). */
  private beaconed = false;

  constructor(private readonly opts: SaveQueueOptions) {}

  /** Adopt the server's revision (and attempt) after a load, refresh or restart. */
  sync(revision: number, attemptNo?: number | null) {
    this.revision = revision;
    if (attemptNo !== undefined) this.attemptNo = attemptNo;
  }

  get size() {
    return this.entries.size;
  }

  /** Queued picks as an answer map. */
  overlay(): Answers {
    const out: Answers = {};
    for (const [id, e] of this.entries) out[String(id)] = e.answerIds;
    return out;
  }

  /** Queue a pick; it's sent after a short pause so quick changes become one write. */
  set(questionId: number, answerIds: number[], currentIndex: number) {
    this.entries.set(questionId, { answerIds, currentIndex });
    this.beaconed = false;
    this.persist();
    this.failures = 0; // new activity: start the retry ladder again
    if (!this.running) this.schedule(DEBOUNCE_MS);
  }

  /** Send now, skipping the debounce and any backoff wait. Rejects if a save fails. */
  async flushNow(): Promise<void> {
    this.cancelTimer();
    if (this.running) await this.running.catch(() => {});
    this.cancelTimer(); // the run we waited for may have scheduled a retry
    if (this.entries.size === 0) return;
    this.failures = 0;
    await this.run();
  }

  /** Wait for an in-flight request (used before restarting). */
  async settle(): Promise<void> {
    await this.running?.catch(() => {});
  }

  /** Drop everything (restart, or the attempt was already completed). */
  clear() {
    this.cancelTimer();
    this.entries.clear();
    this.failures = 0;
    this.persist();
  }

  dispose() {
    this.cancelTimer();
  }

  /**
   * Restores entries saved by an earlier page load of the same attempt.
   * Entries from another attempt or older than a day are discarded.
   */
  restore(attemptNo: number | null): Answers {
    const stored = this.read();
    if (!stored) return {};
    const fresh = (this.opts.now ?? Date.now)() - stored.savedAt <= MAX_STORED_AGE_MS;
    const sameAttempt = stored.attemptNo === null || stored.attemptNo === attemptNo;
    if (!fresh || !sameAttempt) {
      this.write(null);
      return {};
    }
    for (const [id, entry] of stored.entries) if (!this.entries.has(id)) this.entries.set(id, entry);
    this.attemptNo = attemptNo ?? stored.attemptNo;
    return this.overlay();
  }

  /** Body for the batch endpoint (sendBeacon). */
  beaconPayload() {
    const entries = [...this.entries];
    return {
      answers: entries.map(([questionId, e]) => ({ questionId, answerIds: e.answerIds })),
      currentIndex: entries.length ? Math.max(...entries.map(([, e]) => e.currentIndex)) : undefined,
    };
  }

  /**
   * Hands queued entries to the browser to deliver after the page is gone.
   * Entries stay queued (and stored): delivery isn't confirmed, and saving the
   * same answer twice is harmless. Sent at most once until the queue changes.
   */
  beacon(url: string, sendBeacon: (url: string, data: Blob) => boolean, extra: Record<string, unknown> = {}): boolean {
    // Once per change: a second beacon for a first answer would create a second session.
    if (this.entries.size === 0 || this.beaconed) return false;
    // text/plain keeps it a "simple" request: no preflight, same-origin cookies sent.
    const body = JSON.stringify({ ...extra, ...this.beaconPayload() });
    this.beaconed = sendBeacon(url, new Blob([body], { type: "text/plain" }));
    return this.beaconed;
  }

  /* -------------------------------- Internals ----------------------------- */

  private schedule(ms: number) {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run().catch(() => {});
    }, ms);
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): Promise<void> {
    if (this.running) return this.running;
    const work = (async () => {
      while (this.entries.size > 0) {
        const [questionId, entry] = this.entries.entries().next().value as [number, QueueEntry];
        let res: SaveResponse;
        try {
          res = await this.opts.send(questionId, entry, this.revision);
        } catch (error) {
          if (!isRetriable(error)) {
            if (this.entries.get(questionId) === entry) this.entries.delete(questionId);
            this.persist();
            this.opts.onDropped(error, questionId);
            continue;
          }
          this.failures += 1;
          if (this.failures > BACKOFF_MS.length) {
            this.opts.onGaveUp(error);
          } else {
            this.schedule(Math.max(BACKOFF_MS[this.failures - 1], retryAfterMs(error)));
          }
          throw error;
        }
        this.failures = 0;
        // A newer pick for the same question may have been queued meanwhile.
        if (this.entries.get(questionId) === entry) this.entries.delete(questionId);
        this.revision = res.revision;
        if (res.attemptNo !== null) this.attemptNo = res.attemptNo;
        this.persist();
        this.opts.onSaved(res, this.overlay());
      }
    })();
    this.running = work.finally(() => {
      this.running = null;
      // Picks made while a request was in flight are sent next.
      if (this.entries.size > 0 && !this.timer && this.failures === 0) this.schedule(0);
    });
    return this.running;
  }

  private persist() {
    this.write(
      this.entries.size
        ? { v: 1, savedAt: (this.opts.now ?? Date.now)(), attemptNo: this.attemptNo, entries: [...this.entries] }
        : null,
    );
  }

  private read(): Stored | null {
    const { storage, storageKey } = this.opts;
    if (!storage || !storageKey) return null;
    try {
      const raw = storage.getItem(storageKey);
      const data = raw ? (JSON.parse(raw) as Stored) : null;
      return data?.v === 1 && Array.isArray(data.entries) ? data : null;
    } catch {
      return null; // private mode, quota, corrupt JSON: storage is best-effort
    }
  }

  private write(data: Stored | null) {
    const { storage, storageKey } = this.opts;
    if (!storage || !storageKey) return;
    try {
      if (data) storage.setItem(storageKey, JSON.stringify(data));
      else storage.removeItem(storageKey);
    } catch {
      // best-effort
    }
  }
}
