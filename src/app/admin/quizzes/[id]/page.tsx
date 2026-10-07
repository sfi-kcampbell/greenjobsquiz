import type { Metadata } from "next";
import Link from "next/link";
import { ConfigWarning } from "@/components/config-warning";
import { CssForm } from "@/components/css-form";
import { StatusBadge } from "@/components/status-badge";
import { listResponses } from "@/lib/content/responses";
import { db } from "@/lib/db/client";
import { requestOrigin } from "@/lib/app-url";
import { getMediaMeta, mediaUrl } from "@/lib/media/media";
import { healthReport } from "@/lib/scoring/health";
import { updateQuizCssAction } from "../actions";
import { BannerForm } from "./banner-form";
import { loadBundle, loadQuiz } from "./load";
import { DeliveryForm, EmbedSnippet } from "./delivery-form";
import { PublishControl } from "./publish-control";
import { RespondentForm } from "./respondent-form";
import { ScoringForm } from "./scoring-form";
import { DeleteQuizForm, SettingsForm } from "./settings-form";

export async function generateMetadata({ params }: PageProps<"/admin/quizzes/[id]">): Promise<Metadata> {
  const quiz = await loadQuiz((await params).id);
  return { title: `${quiz.title} settings` };
}

export default async function QuizSettingsPage({ params }: PageProps<"/admin/quizzes/[id]">) {
  const quiz = await loadQuiz((await params).id);
  const responses = await listResponses(db, quiz.id);
  const healthWarnings = healthReport((await loadBundle(quiz.id)).health).warningCount;
  // Relative, so previews link to themselves rather than to APP_URL.
  const apiUrl = `/api/v1/quizzes/${quiz.id}`;
  const pageUrl = `/quizzes/${quiz.slug}`;
  const bannerMeta = quiz.bannerMediaId ? await getMediaMeta(db, quiz.bannerMediaId) : null;
  const banner = bannerMeta
    ? { mediaId: bannerMeta.id, url: mediaUrl(bannerMeta.id), alt: quiz.bannerAlt ?? "", width: bannerMeta.width, height: bannerMeta.height }
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/quizzes" className="text-sm text-muted hover:text-foreground">
          ← All quizzes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <StatusBadge status={quiz.status} />
        </div>
        <Link
          href={`/admin/quizzes/${quiz.id}/builder/categories`}
          className="w-fit text-brand underline underline-offset-4"
        >
          Open builder
        </Link>
      </div>

      <section aria-labelledby="details" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="details" className="font-semibold">
          Details
        </h2>
        <SettingsForm quizId={quiz.id} title={quiz.title} slug={quiz.slug} introHtml={quiz.introHtml} />
      </section>

      <section aria-labelledby="publishing" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="publishing" className="font-semibold">
          Publishing
        </h2>
        <ConfigWarning />
        <PublishControl quizId={quiz.id} status={quiz.status} healthWarnings={healthWarnings} apiUrl={apiUrl} pageUrl={pageUrl} />
      </section>

      <section aria-labelledby="delivery" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="delivery" className="font-semibold">
          Delivery
        </h2>
        <DeliveryForm
          quizId={quiz.id}
          slug={quiz.slug}
          values={{
            layout: quiz.layout,
            layoutTemplate: quiz.layoutTemplate,
            deliveryMode: quiz.deliveryMode,
            headlessBaseUrl: quiz.headlessBaseUrl,
          }}
        />
        {quiz.status === "published" && quiz.deliveryMode === "hosted" && (
          <EmbedSnippet origin={await requestOrigin()} slug={quiz.slug} title={quiz.title} />
        )}
      </section>

      <section aria-labelledby="banner" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="banner" className="font-semibold">
          Banner
        </h2>
        <BannerForm quizId={quiz.id} banner={banner} />
      </section>

      <section aria-labelledby="quiz-css" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="quiz-css" className="font-semibold">
          Quiz CSS (overrides the site-wide CSS)
        </h2>
        <CssForm
          id="quiz-css-input"
          label="Quiz CSS"
          action={updateQuizCssAction.bind(null, quiz.id)}
          css={quiz.customCss}
          hint="Styles for this quiz only, on its page, embed and shared results. They come after the site-wide CSS, so a rule here wins over the same rule there (unless that one uses !important). Admin pages are never affected."
          previewUrl={quiz.status === "published" ? pageUrl : null}
          submitLabel="Save quiz CSS"
        />
      </section>

      <section aria-labelledby="respondents" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="respondents" className="font-semibold">
          Respondent options
        </h2>
        <RespondentForm
          quizId={quiz.id}
          values={{ showProgress: quiz.showProgress, autoAdvance: quiz.autoAdvance, retakeAllowed: quiz.retakeAllowed }}
        />
      </section>

      <section aria-labelledby="scoring" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="scoring" className="font-semibold">
          Scoring
        </h2>
        <ScoringForm
          quizId={quiz.id}
          runnersUpCount={quiz.runnersUpCount}
          normalizePerCategory={quiz.normalizePerCategory}
          defaultResultId={quiz.defaultResultId}
          responses={responses.map(({ id, title }) => ({ id, title }))}
        />
      </section>

      <section aria-labelledby="danger" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-4">
        <h2 id="danger" className="font-semibold text-danger">
          Delete quiz
        </h2>
        <p className="text-sm text-muted">
          Deletes the quiz with all its categories, questions and responses. Quizzes with submissions
          can&apos;t be deleted.
        </p>
        <DeleteQuizForm quizId={quiz.id} title={quiz.title} />
      </section>
    </div>
  );
}
