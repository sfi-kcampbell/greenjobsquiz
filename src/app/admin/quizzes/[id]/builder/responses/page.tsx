import { loadQuiz } from "../../load";
import { ComingSoon } from "../coming-soon";

export default async function Page({ params }: PageProps<"/admin/quizzes/[id]/builder/responses">) {
  await loadQuiz((await params).id);
  return <ComingSoon what="Responses" phase={3} />;
}
