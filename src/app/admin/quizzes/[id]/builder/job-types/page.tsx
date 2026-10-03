import { loadQuiz } from "../../load";
import { ComingSoon } from "../coming-soon";

export default async function Page({ params }: PageProps<"/admin/quizzes/[id]/builder/job-types">) {
  await loadQuiz((await params).id);
  return <ComingSoon what="Job types" phase={3} />;
}
