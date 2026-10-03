import { loadQuiz } from "../../load";
import { ComingSoon } from "../coming-soon";

export default async function Page({ params }: PageProps<"/admin/quizzes/[id]/builder/questions">) {
  await loadQuiz((await params).id);
  return <ComingSoon what="Questions and answers" phase={2} />;
}
