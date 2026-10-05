import type { Metadata } from "next";
import { loadBundle, loadQuiz } from "../../load";
import { SimulatorLoader } from "./loader";

export const metadata: Metadata = { title: "Simulate" };

export default async function SimulatePage({ params }: PageProps<"/admin/quizzes/[id]/builder/simulate">) {
  const quiz = await loadQuiz((await params).id);
  const bundle = await loadBundle(quiz.id);

  return (
    <section aria-labelledby="simulate-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="simulate-heading" className="text-lg font-semibold">
          Simulate
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Answer as a respondent would and watch the result update. This uses the same scoring the public quiz
          will use, with the saved questions, responses and scoring settings. Nothing here is recorded.
        </p>
      </div>
      <SimulatorLoader
        quizId={quiz.id}
        model={bundle.model}
        display={bundle.display}
        runnersUpCount={bundle.settings.runnersUpCount}
      />
    </section>
  );
}
