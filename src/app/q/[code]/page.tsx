import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/quiz/page-shell";
import { CODE_MESSAGES, lookupShortCode } from "@/lib/content/quiz-codes";
import { db } from "@/lib/db/client";
import { clientIpHash, hit } from "@/lib/rate-limit/fixed-window";

/**
 * Short links for mailers, QR codes and classes: /q/{CODE} opens the quiz
 * with the code applied, or explains why the code can't be used.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz code", robots: { index: false } };

const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function ShortCodePage({ params }: PageProps<"/q/[code]">) {
  const raw = decodeURIComponent((await params).code);
  const limit = await hit(`q:ip:${await clientIpHash()}`, 60, 3600);
  if (!limit.allowed) return <Problem message="Too many codes tried from here. Please wait a while and try again." />;

  const { resolved, quiz } = await lookupShortCode(db, raw);
  if (resolved.ok && quiz) {
    const path = `/quizzes/${encodeURIComponent(quiz.slug)}?code=${encodeURIComponent(resolved.code)}`;
    redirect(quiz.deliveryMode === "headless" && quiz.headlessBaseUrl ? `${quiz.headlessBaseUrl}${path}` : path);
  }
  const message =
    !resolved.ok && resolved.reason === "not_open_yet" && resolved.opensAt
      ? `${CODE_MESSAGES.not_open_yet} It opens on ${longDate.format(resolved.opensAt)}.`
      : CODE_MESSAGES[resolved.ok ? "not_found" : resolved.reason];
  return <Problem title={quiz?.title} message={message} />;
}

function Problem({ title, message }: { title?: string; message: string }) {
  return (
    <PageShell template="default">
      <div className="flex flex-col gap-4">
        {title && <p className="text-sm font-medium text-muted">{title}</p>}
        <h1 className="text-2xl font-semibold">We couldn&apos;t open that quiz code</h1>
        <p role="alert" className="text-lg">
          {message}
        </p>
        <p>
          <Link href="/quizzes" className="text-brand underline underline-offset-4">
            See all quizzes
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
