import { redirect } from "next/navigation";

export default async function BuilderIndex({ params }: PageProps<"/admin/quizzes/[id]/builder">) {
  redirect(`/admin/quizzes/${(await params).id}/builder/categories`);
}
