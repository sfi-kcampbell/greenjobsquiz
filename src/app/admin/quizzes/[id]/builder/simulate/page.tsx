import { loadQuiz } from "../../load";
import { ComingSoon } from "../coming-soon";

export default async function Page({ params }: PageProps<"/admin/quizzes/[id]/builder/simulate">) {
  await loadQuiz((await params).id);
  return <ComingSoon what="Simulate" phase={4} />;
}
