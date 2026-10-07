/**
 * Site-wide then quiz CSS, after the app's own styles, so the quiz's rules win
 * over the site's. Saved CSS can't contain "<" (customCssInput); escaping it
 * again here means the <style> element can never be closed early regardless.
 */
export function CustomCss({ site, quiz }: { site: string; quiz: string }) {
  const safe = (css: string) => css.replace(/</g, "\\3c ");
  return (
    <>
      {site.trim() && <style id="pltq-site-css" dangerouslySetInnerHTML={{ __html: safe(site) }} />}
      {quiz.trim() && <style id="pltq-quiz-css" dangerouslySetInnerHTML={{ __html: safe(quiz) }} />}
    </>
  );
}
