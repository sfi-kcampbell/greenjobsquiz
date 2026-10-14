/**
 * Loads everything the scoring engine and health checks need for one quiz,
 * plus display names for the admin UI.
 */
import type { Executor } from "@/lib/db/create";
import type { ScoringModel } from "@/lib/scoring/engine";
import type { HealthInput } from "@/lib/scoring/health";
import { bundleFromContent, readWorkingContent } from "./versions";

export type ScoringBundle = {
  model: ScoringModel;
  health: HealthInput;
  display: {
    categories: { id: number; name: string; abbr: string; color: string }[];
    questions: { id: number; title: string; type: "single" | "multi"; maxSelect: number; answers: { id: number; label: string }[] }[];
    results: { id: number; title: string }[];
  };
  settings: { runnersUpCount: number; normalizePerCategory: boolean; defaultResultId: number | null };
};

/** The working copy's bundle (Simulate, Health, admin). Published versions use bundleFromContent. */
export async function loadScoringBundle(db: Executor, quizId: number): Promise<ScoringBundle> {
  return bundleFromContent(await readWorkingContent(db, quizId));
}
