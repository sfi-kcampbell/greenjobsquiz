/**
 * A quiz as one self-contained JSON file: settings, categories, questions,
 * answers, responses, weights and the images they use (base64). Database ids
 * are replaced by keys, so a file imports cleanly into any deployment.
 * Duplicating a quiz is export → import on the same database.
 *
 * Import treats the file as untrusted: it's validated with the editors' own
 * limits, rich text is sanitized again and images go through storeMedia (so
 * SVG and oversized images are still refused).
 */
import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import { z } from "zod";
import type { Database, Executor } from "@/lib/db/create";
import { answers, answerWeights, categories, media, questions, quizzes, results, resultWeights } from "@/lib/db/schema";
import { MediaError, mediaUrl, storeMedia } from "@/lib/media/media";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { ContentError } from "./errors";
import {
  categoryInput,
  customCssInput,
  MAX_ANSWERS,
  MAX_QUESTIONS,
  MAX_RESPONSES,
  quizDeliveryInput,
  responseDetailsInput,
  SLUG_MAX,
  SLUG_PATTERN,
  slugify,
} from "./validation";

export const QUIZ_FILE_FORMAT = "pltq-quiz";
export const QUIZ_FILE_VERSION = 1;
/**
 * Import limit. Vercel refuses request bodies over 4.5 MB, so a file with
 * large images may need them made smaller before it can be imported.
 */
export const QUIZ_FILE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_CATEGORIES = 30;
const MAX_IMAGES = 60;

const MEDIA_REF = /\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/* --------------------------------- Schema -------------------------------- */

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/i, "Keys must be short identifiers.");
const html = z.string().max(20_000).nullable();
const weights = z.record(key, z.number().min(-5).max(5));

const fileSchema = z
  .object({
    format: z.literal(QUIZ_FILE_FORMAT, { error: "This isn't a quiz file." }),
    version: z.literal(QUIZ_FILE_VERSION, { error: "This quiz file is from a newer version of the app." }),
    exportedAt: z.string().optional(),
    quiz: z.object({
      title: z.string().trim().min(1).max(120),
      slug: z.string().max(SLUG_MAX),
      introHtml: html,
      scoringMethod: z.enum(["cosine", "weighted_sum"]),
      normalizePerCategory: z.boolean(),
      runnersUpCount: z.number().int().min(0).max(5),
      layout: z.enum(["stepped", "single_page"]),
      layoutTemplate: z.enum(["default", "canvas"]),
      deliveryMode: z.enum(["hosted", "headless"]),
      headlessBaseUrl: z.string().max(500).nullable(),
      allowSkip: z.boolean(),
      showProgress: z.boolean(),
      retakeAllowed: z.boolean(),
      autoAdvance: z.boolean(),
      resultHeadline: z.string().max(300).nullable(),
      customCss: z.string(),
      defaultResponse: key.nullable(),
      banner: z.object({ image: z.string(), alt: z.string().max(300) }).nullable(),
    }),
    categories: z
      .array(
        z.object({
          key,
          name: z.string(),
          abbr: z.string(),
          color: z.string(),
          importance: z.number(),
          description: z.string().max(2000).nullable(),
        }),
      )
      .max(MAX_CATEGORIES),
    questions: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          helpHtml: html,
          type: z.enum(["single", "multi"]),
          minSelect: z.number().int().min(1).max(MAX_ANSWERS),
          maxSelect: z.number().int().min(1).max(MAX_ANSWERS),
          required: z.boolean(),
          splitMulti: z.boolean(),
          answers: z
            .array(z.object({ label: z.string().trim().min(1).max(200), bodyHtml: html, weights }))
            .max(MAX_ANSWERS),
        }),
      )
      .max(MAX_QUESTIONS),
    responses: z
      .array(
        z.object({
          key,
          title: z.string(),
          excerpt: z.string().nullable(),
          bodyHtml: html,
          ctaUrl: z.string().nullable(),
          ctaLabel: z.string().nullable(),
          weights,
        }),
      )
      .max(MAX_RESPONSES),
    images: z
      .record(
        z.string(),
        z.object({ contentType: z.string(), filename: z.string().nullable(), data: z.string() }),
      )
      .refine((r) => Object.keys(r).length <= MAX_IMAGES, `A quiz file can hold at most ${MAX_IMAGES} images.`),
  })
  .superRefine((f, ctx) => {
    const unique = (values: string[], what: string, path: string) => {
      if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
        ctx.addIssue({ code: "custom", path: [path], message: `Two ${what} have the same name.` });
      }
    };
    unique(f.categories.map((c) => c.key), "categories", "categories");
    unique(f.categories.map((c) => c.name), "categories", "categories");
    unique(f.categories.map((c) => c.abbr), "category abbreviations", "categories");
    unique(f.responses.map((r) => r.key), "responses", "responses");
    const catKeys = new Set(f.categories.map((c) => c.key));
    const badWeight = [...f.questions.flatMap((q) => q.answers.map((a) => a.weights)), ...f.responses.map((r) => r.weights)]
      .some((w) => Object.keys(w).some((k) => !catKeys.has(k)));
    if (badWeight) ctx.addIssue({ code: "custom", path: ["categories"], message: "A weight refers to a category that isn't in the file." });
    if (f.quiz.defaultResponse && !f.responses.some((r) => r.key === f.quiz.defaultResponse)) {
      ctx.addIssue({ code: "custom", path: ["quiz"], message: "The fallback response isn't in the file." });
    }
  });

export type QuizFile = z.infer<typeof fileSchema>;

/* --------------------------------- Export -------------------------------- */

const mediaIdsIn = (texts: (string | null | undefined)[]) =>
  new Set(texts.flatMap((t) => [...(t ?? "").matchAll(MEDIA_REF)].map((m) => m[1])));

/** The quiz's current (not archived) content as a file. */
export async function exportQuiz(db: Executor, quizId: number): Promise<QuizFile> {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!quiz) throw new ContentError("not_found", "That quiz doesn't exist.");

  const cats = await db.select().from(categories).where(eq(categories.quizId, quizId)).orderBy(asc(categories.position), asc(categories.id));
  const qs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.archivedAt)))
    .orderBy(asc(questions.position), asc(questions.id));
  const ans = qs.length
    ? await db
        .select()
        .from(answers)
        .where(and(inArray(answers.questionId, qs.map((q) => q.id)), isNull(answers.archivedAt)))
        .orderBy(asc(answers.position), asc(answers.id))
    : [];
  const aw = ans.length ? await db.select().from(answerWeights).where(inArray(answerWeights.answerId, ans.map((a) => a.id))) : [];
  const rs = await db
    .select()
    .from(results)
    .where(and(eq(results.quizId, quizId), isNull(results.archivedAt)))
    .orderBy(asc(results.position), asc(results.id));
  const rw = rs.length ? await db.select().from(resultWeights).where(inArray(resultWeights.resultId, rs.map((r) => r.id))) : [];

  const catKey = new Map(cats.map((c, i) => [c.id, `c${i + 1}`]));
  const respKey = new Map(rs.map((r, i) => [r.id, `r${i + 1}`]));
  const weightsOf = (rows: { categoryId: number; weight: number }[]) =>
    Object.fromEntries(rows.filter((w) => catKey.has(w.categoryId)).map((w) => [catKey.get(w.categoryId)!, w.weight]));

  const ids = mediaIdsIn([quiz.introHtml, ...qs.map((q) => q.helpHtml), ...ans.map((a) => a.bodyHtml), ...rs.map((r) => r.bodyHtml), quiz.customCss]);
  if (quiz.bannerMediaId) ids.add(quiz.bannerMediaId);
  const files = ids.size
    ? await db
        .select({ id: media.id, contentType: media.contentType, filename: media.filename, bytes: media.bytes })
        .from(media)
        .where(inArray(media.id, [...ids]))
    : [];

  return {
    format: QUIZ_FILE_FORMAT,
    version: QUIZ_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    quiz: {
      title: quiz.title,
      slug: quiz.slug,
      introHtml: quiz.introHtml || null,
      scoringMethod: quiz.scoringMethod,
      normalizePerCategory: quiz.normalizePerCategory,
      runnersUpCount: quiz.runnersUpCount,
      layout: quiz.layout,
      layoutTemplate: quiz.layoutTemplate,
      deliveryMode: quiz.deliveryMode,
      headlessBaseUrl: quiz.headlessBaseUrl,
      allowSkip: quiz.allowSkip,
      showProgress: quiz.showProgress,
      retakeAllowed: quiz.retakeAllowed,
      autoAdvance: quiz.autoAdvance,
      resultHeadline: quiz.resultHeadline,
      customCss: quiz.customCss,
      defaultResponse: quiz.defaultResultId ? (respKey.get(quiz.defaultResultId) ?? null) : null,
      banner: quiz.bannerMediaId && files.some((f) => f.id === quiz.bannerMediaId) ? { image: quiz.bannerMediaId, alt: quiz.bannerAlt ?? "" } : null,
    },
    categories: cats.map((c) => ({
      key: catKey.get(c.id)!,
      name: c.name,
      abbr: c.abbr,
      color: c.color,
      importance: c.importance,
      description: c.description,
    })),
    questions: qs.map((q) => ({
      title: q.title,
      helpHtml: q.helpHtml,
      type: q.type,
      minSelect: q.minSelect,
      maxSelect: q.maxSelect,
      required: q.required,
      splitMulti: q.splitMulti,
      answers: ans
        .filter((a) => a.questionId === q.id)
        .map((a) => ({ label: a.label, bodyHtml: a.bodyHtml, weights: weightsOf(aw.filter((w) => w.answerId === a.id)) })),
    })),
    responses: rs.map((r) => ({
      key: respKey.get(r.id)!,
      title: r.title,
      excerpt: r.excerpt,
      bodyHtml: r.bodyHtml || null,
      ctaUrl: r.ctaUrl,
      ctaLabel: r.ctaLabel,
      weights: weightsOf(rw.filter((w) => w.resultId === r.id)),
    })),
    images: Object.fromEntries(
      files.map((f) => [f.id, { contentType: f.contentType, filename: f.filename, data: Buffer.from(f.bytes).toString("base64") }]),
    ),
  };
}

/* --------------------------------- Import -------------------------------- */

/** Parses an uploaded file, with messages people can act on. */
export function parseQuizFile(text: string): QuizFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ContentError("invalid", "That file isn't a quiz export (it isn't valid JSON).");
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new ContentError("invalid", `That quiz file can't be imported: ${issue.message}${where}`);
  }
  return parsed.data;
}

/** A free slug based on `wanted` ("green-jobs" → "green-jobs-copy", "green-jobs-copy-2", …). */
async function freeSlug(db: Executor, wanted: string, copy: boolean): Promise<string> {
  const base = (SLUG_PATTERN.test(wanted) ? wanted : slugify(wanted) || "quiz").slice(0, SLUG_MAX - 10);
  const taken = new Set(
    (await db.select({ slug: quizzes.slug }).from(quizzes).where(like(quizzes.slug, `${base}%`))).map((r) => r.slug),
  );
  const first = copy ? `${base}-copy` : base;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) if (!taken.has(`${first}-${n}`)) return `${first}-${n}`;
}

/**
 * Creates a new draft quiz from a file. Returns its id. `title` overrides the
 * file's title (Duplicate uses "Copy of …").
 */
export async function importQuiz(
  db: Database,
  file: QuizFile,
  opts: { createdBy: string; title?: string; copy?: boolean },
): Promise<number> {
  const fail = (message: string): never => {
    throw new ContentError("invalid", `That quiz file can't be imported: ${message}`);
  };
  // Re-check against the editors' own rules.
  const cats = file.categories.map((c) => {
    const parsed = categoryInput.safeParse(c);
    return parsed.success ? { ...c, ...parsed.data } : fail(`category "${c.name}": ${parsed.error.issues[0].message}`);
  });
  const responsesIn = file.responses.map((r) => {
    const parsed = responseDetailsInput.safeParse({ ...r, excerpt: r.excerpt ?? "", ctaUrl: r.ctaUrl ?? "", ctaLabel: r.ctaLabel ?? "", weights: {} });
    return parsed.success ? { ...r, ...parsed.data, weights: r.weights } : fail(`response "${r.title}": ${parsed.error.issues[0].message}`);
  });
  for (const q of file.questions) {
    if (q.type === "multi" && (q.maxSelect < q.minSelect || (q.answers.length > 0 && q.maxSelect > q.answers.length))) {
      fail(`question "${q.title}" has impossible selection limits.`);
    }
  }
  const css = customCssInput.safeParse(file.quiz.customCss);
  if (!css.success) fail(`the quiz CSS: ${css.error.issues[0].message}`);
  const delivery = quizDeliveryInput.safeParse({
    layout: file.quiz.layout,
    layoutTemplate: file.quiz.layoutTemplate,
    deliveryMode: file.quiz.deliveryMode,
    headlessBaseUrl: file.quiz.headlessBaseUrl ?? "",
  });
  if (!delivery.success) fail(`delivery: ${delivery.error.issues[0].message}`);

  // Images first (outside the transaction: each is its own deduplicated row).
  const mediaMap = new Map<string, string>();
  for (const [oldId, image] of Object.entries(file.images)) {
    try {
      const stored = await storeMedia(db, { bytes: Buffer.from(image.data, "base64"), filename: image.filename, createdBy: opts.createdBy });
      mediaMap.set(oldId, stored.id);
    } catch (error) {
      if (error instanceof MediaError) fail(`image ${image.filename ?? oldId}: ${error.message}`);
      throw error;
    }
  }
  const relink = (text: string | null) =>
    text === null ? null : text.replace(MEDIA_REF, (whole, id: string) => (mediaMap.has(id) ? mediaUrl(mediaMap.get(id)!) : whole));
  const rich = (text: string | null) => sanitizeRichText(relink(text));

  return db.transaction(async (tx) => {
    const slug = await freeSlug(tx, file.quiz.slug, Boolean(opts.copy));
    const banner = file.quiz.banner && mediaMap.get(file.quiz.banner.image);
    const [quiz] = await tx
      .insert(quizzes)
      .values({
        title: (opts.title ?? file.quiz.title).slice(0, 120),
        slug,
        introHtml: rich(file.quiz.introHtml) ?? "",
        scoringMethod: file.quiz.scoringMethod,
        normalizePerCategory: file.quiz.normalizePerCategory,
        runnersUpCount: file.quiz.runnersUpCount,
        layout: delivery.data!.layout,
        layoutTemplate: delivery.data!.layoutTemplate,
        deliveryMode: delivery.data!.deliveryMode,
        headlessBaseUrl: delivery.data!.headlessBaseUrl,
        allowSkip: file.quiz.allowSkip,
        showProgress: file.quiz.showProgress,
        retakeAllowed: file.quiz.retakeAllowed,
        autoAdvance: file.quiz.autoAdvance,
        resultHeadline: file.quiz.resultHeadline,
        customCss: relink(css.data!) ?? "",
        bannerMediaId: banner || null,
        bannerAlt: banner ? file.quiz.banner!.alt : null,
        createdBy: opts.createdBy,
      })
      .returning({ id: quizzes.id });

    const catIds = new Map<string, number>();
    for (const [i, c] of cats.entries()) {
      const [row] = await tx
        .insert(categories)
        .values({ quizId: quiz.id, name: c.name, abbr: c.abbr, color: c.color, importance: c.importance, description: c.description, position: i })
        .returning({ id: categories.id });
      catIds.set(c.key, row.id);
    }
    const weightRows = (w: Record<string, number>) =>
      Object.entries(w)
        .map(([k, v]) => ({ categoryId: catIds.get(k)!, weight: Math.round(v * 100) / 100 }))
        .filter((r) => r.weight !== 0);

    for (const [i, q] of file.questions.entries()) {
      const single = q.type === "single";
      const [row] = await tx
        .insert(questions)
        .values({
          quizId: quiz.id,
          title: q.title,
          helpHtml: rich(q.helpHtml),
          type: q.type,
          minSelect: single ? 1 : q.minSelect,
          maxSelect: single ? 1 : q.maxSelect,
          required: q.required,
          splitMulti: single ? false : q.splitMulti,
          position: i,
        })
        .returning({ id: questions.id });
      for (const [j, a] of q.answers.entries()) {
        const [answer] = await tx
          .insert(answers)
          .values({ questionId: row.id, label: a.label, bodyHtml: rich(a.bodyHtml), position: j })
          .returning({ id: answers.id });
        const w = weightRows(a.weights);
        if (w.length) await tx.insert(answerWeights).values(w.map((x) => ({ ...x, answerId: answer.id })));
      }
    }

    const respIds = new Map<string, number>();
    for (const [i, r] of responsesIn.entries()) {
      const [row] = await tx
        .insert(results)
        .values({
          quizId: quiz.id,
          title: r.title,
          excerpt: r.excerpt,
          bodyHtml: rich(r.bodyHtml) ?? "",
          ctaUrl: r.ctaUrl,
          ctaLabel: r.ctaLabel,
          position: i,
        })
        .returning({ id: results.id });
      respIds.set(r.key, row.id);
      const w = weightRows(r.weights);
      if (w.length) await tx.insert(resultWeights).values(w.map((x) => ({ ...x, resultId: row.id })));
    }
    if (file.quiz.defaultResponse) {
      await tx.update(quizzes).set({ defaultResultId: respIds.get(file.quiz.defaultResponse) ?? null }).where(eq(quizzes.id, quiz.id));
    }
    return quiz.id;
  });
}

/** Duplicate = export → import as a draft named "Copy of …". */
export async function duplicateQuiz(db: Database, quizId: number, createdBy: string): Promise<number> {
  const file = await exportQuiz(db, quizId);
  return importQuiz(db, file, { createdBy, title: `Copy of ${file.quiz.title}`, copy: true });
}
