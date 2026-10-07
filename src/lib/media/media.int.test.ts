import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getQuiz, createQuiz, setQuizStatus, updateQuizBanner, updateQuizCss } from "@/lib/content/quizzes";
import { getSiteCss, updateSiteCss } from "@/lib/content/settings";
import { quizBannerInput } from "@/lib/content/validation";
import type { Database } from "@/lib/db/create";
import { media } from "@/lib/db/schema";
import { getPublishedQuiz, getPublishedQuizPage, getQuizBranding } from "@/lib/public/structure";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { getMedia, MediaError, storeMedia } from "./media";

/** A 1×1 PNG with a chosen colour byte, so tests can make distinct images. */
function png(width: number, height: number, salt = 0): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[39] = salt;
  return b;
}

describe.skipIf(!TEST_DATABASE_URL)("media, banner and custom CSS (Postgres)", () => {
  let db: Database;
  let quizId: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
  });

  it("stores an image once per content and serves its bytes", async () => {
    const first = await storeMedia(db, { bytes: png(1200, 300), filename: "banner.png", quizId, createdBy: "a@example.org" });
    expect(first).toMatchObject({ url: `/media/${first.id}`, width: 1200, height: 300, contentType: "image/png" });
    const again = await storeMedia(db, { bytes: png(1200, 300), filename: "copy.png" });
    expect(again.id).toBe(first.id);
    expect(await db.$count(media)).toBe(1);
    const other = await storeMedia(db, { bytes: png(1200, 300, 7) });
    expect(other.id).not.toBe(first.id);

    const got = await getMedia(db, first.id);
    expect(got?.contentType).toBe("image/png");
    expect(Buffer.from(got!.bytes).equals(Buffer.from(png(1200, 300)))).toBe(true);
    expect(await getMedia(db, "not-a-uuid")).toBeNull();
  });

  it("refuses empty, oversized and non-image files", async () => {
    await expect(storeMedia(db, { bytes: new Uint8Array() })).rejects.toBeInstanceOf(MediaError);
    await expect(storeMedia(db, { bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>") })).rejects.toMatchObject({ code: "unsupported" });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png(10, 10));
    await expect(storeMedia(db, { bytes: big })).rejects.toMatchObject({ code: "too_large" });
  });

  it("sets, replaces and removes the banner, bumping the structure version", async () => {
    await setQuizStatus(db, quizId, "published");
    const v0 = (await getQuiz(db, quizId))!.structureVersion;
    const a = await storeMedia(db, { bytes: png(1200, 300) });
    await updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: a.id, alt: "Students planting trees" }));
    let pub = (await getPublishedQuiz(db, { id: quizId }))!;
    expect(pub.banner).toEqual({ url: `/media/${a.id}`, alt: "Students planting trees", width: 1200, height: 300 });
    expect(pub.structureVersion).toBeGreaterThan(v0);

    const b = await storeMedia(db, { bytes: png(800, 200, 1) });
    await updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: b.id, alt: "" }));
    expect((await getQuizBranding(db, quizId)).banner).toEqual({ url: `/media/${b.id}`, alt: "", width: 800, height: 200 });

    await updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: "", alt: "ignored" }));
    pub = (await getPublishedQuiz(db, { id: quizId }))!;
    expect(pub.banner).toBeNull();
    expect((await getQuiz(db, quizId))!.bannerAlt).toBeNull();
  });

  it("refuses an unknown image, and drops the banner if its image is deleted", async () => {
    await expect(
      updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: "0b4e7a0e-5c1b-4a5e-9f00-111111111111", alt: "" })),
    ).rejects.toThrow(/wasn't found/);
    const a = await storeMedia(db, { bytes: png(100, 100) });
    await updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: a.id, alt: "x" }));
    await db.delete(media).where(eq(media.id, a.id));
    expect((await getQuiz(db, quizId))!.bannerMediaId).toBeNull();
    expect((await getQuizBranding(db, quizId)).banner).toBeNull();
  });

  it("saves quiz and site CSS; the page loader carries the quiz's", async () => {
    await setQuizStatus(db, quizId, "published");
    expect(await getSiteCss(db)).toBe("");
    await updateSiteCss(db, ".pltq-question { border-left: 4px solid red; }");
    await updateSiteCss(db, ".pltq-question { border-left: 4px solid green; }");
    expect(await getSiteCss(db)).toContain("green");
    const before = (await getQuiz(db, quizId))!.structureVersion;
    await updateQuizCss(db, quizId, ".pltq-question { border-left-color: blue; }");
    expect((await getQuiz(db, quizId))!.structureVersion).toBe(before + 1);
    expect((await getPublishedQuizPage(db, "green-jobs"))!.customCss).toContain("blue");
    expect((await getQuizBranding(db, quizId)).customCss).toContain("blue");
  });
});
