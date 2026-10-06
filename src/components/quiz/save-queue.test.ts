import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type SaveResponse } from "./api";
import { BACKOFF_MS, DEBOUNCE_MS, MAX_STORED_AGE_MS, SaveQueue, type QueueEntry } from "./save-queue";

const ok = (revision: number, extra: Partial<SaveResponse> = {}): SaveResponse => ({
  revision,
  stale: false,
  answeredCount: 1,
  total: 3,
  attemptNo: 1,
  ...extra,
});
const network = () => new ApiError(0, "quiz_network_error", "offline");

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function setup(send: (q: number, e: QueueEntry, rev: number) => Promise<SaveResponse>, now = () => Date.now()) {
  const events = { saved: [] as SaveResponse[], gaveUp: 0, dropped: [] as number[] };
  const storage = memoryStorage();
  const queue = new SaveQueue({
    send: vi.fn(send),
    onSaved: (res) => events.saved.push(res),
    onGaveUp: () => (events.gaveUp += 1),
    onDropped: (_e, q) => events.dropped.push(q),
    storage,
    storageKey: "pltq:pending:1",
    now,
  });
  return { queue, events, storage, send: queue["opts"].send as ReturnType<typeof vi.fn> };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SaveQueue", () => {
  it("debounces quick changes into one write with the latest pick", async () => {
    const { queue, send } = setup(async (_q, _e, rev) => ok(rev + 1));
    queue.set(5, [1], 0);
    queue.set(5, [1, 2], 0);
    queue.set(5, [2], 0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0].slice(0, 2)).toEqual([5, { answerIds: [2], currentIndex: 0 }]);
    expect(queue.size).toBe(0);
  });

  it("sends one at a time, passes the latest revision, and sends picks made during a request", async () => {
    let release!: () => void;
    let inFlight = 0;
    let maxInFlight = 0;
    const { queue, send } = setup(async (_q, _e, rev) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (rev === 0) await new Promise<void>((r) => (release = r));
      inFlight -= 1;
      return ok(rev + 1);
    });
    queue.set(1, [10], 0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    queue.set(1, [11], 0); // changed while the first request is in flight
    queue.set(2, [20], 1);
    release();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(maxInFlight).toBe(1);
    expect(send.mock.calls.map((c) => [c[0], c[1].answerIds, c[2]])).toEqual([
      [1, [10], 0],
      [1, [11], 1],
      [2, [20], 2],
    ]);
    expect(queue.size).toBe(0);
  });

  it("backs off 1, 2, 4, 8, 16, 30 s, then gives up and keeps the entry", async () => {
    const { queue, events, send } = setup(async () => {
      throw network();
    });
    queue.set(1, [10], 0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    for (const [i, wait] of BACKOFF_MS.entries()) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(send).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(i + 2);
    }
    expect(events.gaveUp).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(send).toHaveBeenCalledTimes(BACKOFF_MS.length + 1); // no more retries
    expect(queue.size).toBe(1);
  });

  it("flushNow skips the wait and reports the outcome", async () => {
    let fail = true;
    const { queue, send } = setup(async (_q, _e, rev) => {
      if (fail) throw network();
      return ok(rev + 1);
    });
    queue.set(1, [10], 0);
    await expect(queue.flushNow()).rejects.toBeInstanceOf(ApiError);
    fail = false;
    await queue.flushNow();
    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(0);
  });

  it("honours Retry-After on 429", async () => {
    let calls = 0;
    const { queue, send } = setup(async (_q, _e, rev) => {
      calls += 1;
      if (calls === 1) throw new ApiError(429, "quiz_rate_limited", "slow down", { retryAfter: 20 });
      return ok(rev + 1);
    });
    queue.set(1, [10], 0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 19_999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drops an entry the server refuses for good, without retrying, and carries on", async () => {
    const { queue, events, send } = setup(async (q, _e, rev) => {
      if (q === 1) throw new ApiError(409, "quiz_already_submitted", "done");
      return ok(rev + 1);
    });
    queue.set(1, [10], 0);
    queue.set(2, [20], 1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events.dropped).toEqual([1]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(0);
  });

  it("mirrors to storage and restores the same attempt, ignoring old or other-attempt entries", async () => {
    let now = 1_000_000;
    const first = setup(async () => {
      throw network();
    }, () => now);
    first.queue.attemptNo = 2;
    first.queue.set(1, [10], 0);
    first.queue.set(3, [30], 2);
    expect(JSON.parse(first.storage.data.get("pltq:pending:1")!).entries).toHaveLength(2);

    const again = () =>
      new SaveQueue({
        send: async () => ok(1),
        onSaved: () => {},
        onGaveUp: () => {},
        onDropped: () => {},
        storage: first.storage,
        storageKey: "pltq:pending:1",
        now: () => now,
      });
    expect(again().restore(2)).toEqual({ "1": [10], "3": [30] });
    expect(again().restore(3)).toEqual({}); // another attempt: discarded
    first.queue.set(1, [11], 0);
    now += MAX_STORED_AGE_MS + 1;
    expect(again().restore(2)).toEqual({}); // too old
  });

  it("clear() empties the queue and its storage", () => {
    const { queue, storage } = setup(async () => ok(1));
    queue.set(1, [10], 0);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(storage.data.size).toBe(0);
  });

  it("builds a beacon payload for the batch endpoint", async () => {
    const { queue } = setup(async () => {
      throw network();
    });
    queue.set(1, [10], 0);
    queue.set(2, [20, 21], 3);
    expect(queue.beaconPayload()).toEqual({
      answers: [
        { questionId: 1, answerIds: [10] },
        { questionId: 2, answerIds: [20, 21] },
      ],
      currentIndex: 3,
    });
    const sent: { url: string; body: string }[] = [];
    const beacon = (url: string, data: Blob) => {
      void data.text().then((body) => sent.push({ url, body }));
      return true;
    };
    expect(queue.beacon("/api/v1/quizzes/1/session/answers", beacon)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0].url).toBe("/api/v1/quizzes/1/session/answers");
    expect(JSON.parse(sent[0].body).answers).toHaveLength(2);
    expect(queue.size).toBe(2); // kept until confirmed by a later save
    expect(queue.beacon("/x", beacon)).toBe(false); // pagehide after visibilitychange: not again
    queue.set(3, [30], 4);
    expect(queue.beacon("/x", beacon)).toBe(true); // something new: send again
    queue.clear();
    expect(queue.beacon("/x", beacon)).toBe(false);
  });
});
