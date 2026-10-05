import { missingPublicConfig } from "@/lib/public/tokens";

/** A red notice in the admin when respondents can't save answers in this deployment. */
export function ConfigWarning() {
  if (!missingPublicConfig().includes("TOKEN_PEPPER")) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
      <strong className="text-danger">Respondents can&apos;t save answers:</strong> <code>TOKEN_PEPPER</code> isn&apos;t
      set in this environment. Add it in Vercel → Settings → Environment Variables (for Production and Preview), then
      redeploy.
    </div>
  );
}
