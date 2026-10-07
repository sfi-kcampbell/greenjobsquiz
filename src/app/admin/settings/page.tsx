import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/access";
import { CssForm } from "@/components/css-form";
import { getAccessSettings, getSiteCss } from "@/lib/content/settings";
import { quizzes } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { updateSiteCssAction } from "./actions";
import { AccessSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  const access = await getAccessSettings(db);
  const css = await getSiteCss(db);
  const [preview] = await db
    .select({ slug: quizzes.slug })
    .from(quizzes)
    .where(eq(quizzes.status, "published"))
    .orderBy(asc(quizzes.id))
    .limit(1);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section aria-labelledby="access" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="access" className="font-semibold">
          Embedding and API access
        </h2>
        <AccessSettingsForm embedOrigins={access.embedOrigins} corsOrigins={access.corsOrigins} />
      </section>
      <section aria-labelledby="site-css" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="site-css" className="font-semibold">
          Site-wide CSS (applies to every quiz)
        </h2>
        <CssForm
          id="site-css-input"
          label="Site-wide CSS"
          action={updateSiteCssAction}
          css={css}
          hint="Styles for every quiz's page, embed and shared results. A quiz's own CSS comes after this, so it can override these rules. Admin pages are never affected."
          previewUrl={preview ? `/quizzes/${preview.slug}` : null}
          submitLabel="Save site CSS"
        />
      </section>
      <p className="text-sm text-muted">Privacy and data retention settings arrive in Phase 14.</p>
    </div>
  );
}
