/**
 * What a result's share card shows. Pure, so it's tested without rendering;
 * the card route turns this into a 1200×630 PNG.
 */
import type { ResultPayload } from "./sessions";

export const CARD_SIZE = { width: 1200, height: 630 } as const;
export const SITE_NAME = "PLT Green Jobs Quiz";
/** Image types the card renderer can draw (it can't decode WebP or GIF). */
export const CARD_IMAGE_TYPES = ["image/png", "image/jpeg"];

export type CardContent = {
  quizTitle: string;
  /** "My best match" headline, or a prompt when there's no match. */
  lead: string;
  title: string;
  percent: number | null;
  categories: { label: string; color: string; percent: number }[];
  alt: string;
};

export function trimText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export function cardContent(result: ResultPayload): CardContent {
  const quizTitle = trimText(result.quiz.title, 60);
  const categories = Object.values(result.scores)
    .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((c) => ({ label: trimText(c.label, 28), color: c.color, percent: c.percent }));
  if (!result.match) {
    return {
      quizTitle,
      lead: quizTitle,
      title: "Take the quiz to find your match",
      percent: null,
      categories,
      alt: `${quizTitle}: take the quiz to find your match`,
    };
  }
  const title = trimText(result.match.title, 48);
  const percent = !result.isFallback && result.match.percent !== null ? result.match.percent : null;
  return {
    quizTitle,
    lead: "My best match",
    title,
    percent,
    categories,
    alt: `${quizTitle} result: my best match is ${title}${percent !== null ? `, a ${percent}% match` : ""}.`,
  };
}

/** Link-preview title and description for the share page. */
export function shareMetadataText(result: ResultPayload) {
  const quiz = result.quiz.title;
  if (!result.match) return { title: `My result on ${quiz}`, description: `Take ${quiz} to find careers that fit you.` };
  return {
    title: `I got ${result.match.title} on ${quiz}`,
    description: trimText(result.match.excerpt ?? `See which careers fit you best. Take ${quiz} too.`, 200),
  };
}
