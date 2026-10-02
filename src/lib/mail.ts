import "server-only";

type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends a transactional email through Resend.
 *
 * Without AUTH_RESEND_KEY outside production, the email is printed to the
 * server console instead, so sign-in works locally with no email account.
 */
export async function sendEmail({ to, subject, html, text }: Email): Promise<void> {
  const apiKey = process.env.AUTH_RESEND_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_RESEND_KEY is not set; cannot send email.");
    }
    console.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "PLT Quiz <no-reply@example.com>",
      to,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A simple one-button email. */
export function buttonEmail(opts: { heading: string; body: string; url: string; button: string }) {
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f3;font-family:Arial,Helvetica,sans-serif;color:#1f2a1f">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 24px">${escapeHtml(opts.body)}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(opts.url)}"
        style="display:inline-block;background:#2f5d3a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escapeHtml(opts.button)}</a></p>
      <p style="font-size:13px;color:#5b665b;margin:0">If you didn't expect this email, you can ignore it.</p>
    </td></tr>
  </table>
</body></html>`;
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.button}: ${opts.url}\n`;
  return { html, text };
}
