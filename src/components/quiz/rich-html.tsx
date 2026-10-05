/** Server-sanitized authored HTML only (intro, help, answer details, response body). */
export function RichHtml({ html, id, className = "" }: { html: string | null; id?: string; className?: string }) {
  if (!html) return null;
  return <div id={id} className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
