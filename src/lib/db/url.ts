/**
 * pg currently treats sslmode=prefer, require and verify-ca as verify-full,
 * and warns that a future major version will switch them to libpq's weaker
 * meanings. Asking for verify-full explicitly keeps today's behaviour (full
 * certificate checks) and silences the warning. Other modes are left alone.
 */
export function withSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}
