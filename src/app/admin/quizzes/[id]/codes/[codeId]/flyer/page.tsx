import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/quiz-result/[token]/print-button";
import { requestOrigin } from "@/lib/app-url";
import { requireStaff } from "@/lib/auth/access";
import { idSchema } from "@/lib/content/action-result";
import { qrSvg } from "@/lib/content/qr";
import { db } from "@/lib/db/client";
import { quizCodes, quizzes } from "@/lib/db/schema";
import { stripHtml } from "@/lib/export/csv";
import { getQuizBranding } from "@/lib/public/structure";

export const metadata: Metadata = { title: "Flyer" };

/** A one-page printable flyer: title, pitch, a large QR code and the short link. */
export default async function FlyerPage({ params }: PageProps<"/admin/quizzes/[id]/codes/[codeId]/flyer">) {
  await requireStaff();
  const p = await params;
  const quizId = idSchema.safeParse(p.id);
  const codeId = idSchema.safeParse(p.codeId);
  if (!quizId.success || !codeId.success) notFound();
  const [row] = await db
    .select({ code: quizCodes.code, title: quizzes.title, introHtml: quizzes.introHtml })
    .from(quizCodes)
    .innerJoin(quizzes, eq(quizzes.id, quizCodes.quizId))
    .where(and(eq(quizCodes.id, codeId.data), eq(quizCodes.quizId, quizId.data)))
    .limit(1);
  if (!row) notFound();

  const origin = await requestOrigin();
  const link = `${origin}/q/${row.code}`;
  const svg = await qrSvg(link);
  const { banner } = await getQuizBranding(db, quizId.data);
  const pitch = stripHtml(row.introHtml, 400) || "Answer a few quick questions to find green careers that fit you.";
  const editable = "rounded outline-offset-4 hover:outline hover:outline-1 hover:outline-border focus:outline-2 focus:outline-brand";

  return (
    <div className="flex flex-col gap-4">
      {/* Only the flyer prints: no admin header, one letter-size page. */}
      <style>{"@media print { body > div > header, .flyer-tools { display: none !important; } main { padding: 0 !important; max-width: none !important; } @page { size: letter; margin: 0.5in; } }"}</style>
      <div className="flyer-tools flex flex-wrap items-center gap-3 text-sm">
        <PrintButton />
        <p className="text-muted">Click the headline or text to change them before printing. Changes aren&apos;t saved.</p>
      </div>
      <article className="mx-auto flex w-full max-w-[7.5in] flex-col items-center gap-6 rounded-lg border border-border bg-white p-10 text-center text-black print:border-0 print:p-0">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.url} alt={banner.alt} width={banner.width} height={banner.height} className="h-auto max-h-48 w-full rounded-md object-cover" />
        )}
        <h1 contentEditable suppressContentEditableWarning className={`text-4xl font-bold ${editable}`}>
          {row.title}
        </h1>
        <p contentEditable suppressContentEditableWarning className={`max-w-xl text-xl ${editable}`}>
          {pitch}
        </p>
        <div
          role="img"
          aria-label={`QR code for ${link}`}
          className="w-[3.5in] max-w-full [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-xl">
          Scan the code, or go to
          <br />
          <strong className="break-all text-2xl">{link.replace(/^https?:\/\//, "")}</strong>
        </p>
        <p className="text-lg">
          Quiz code: <strong className="font-mono tracking-widest">{row.code}</strong>
        </p>
      </article>
    </div>
  );
}
