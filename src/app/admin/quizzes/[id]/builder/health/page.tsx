import { loadQuiz } from "../../load";
import { ComingSoon } from "../coming-soon";

export default async function Page({ params }: PageProps<"/admin/quizzes/[id]/builder/health">) {
  await loadQuiz((await params).id);
  return <ComingSoon what="Health checks" phase={4} />;
}
