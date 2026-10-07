/**
 * The stable class names custom CSS can target. Tailwind classes on the same
 * elements are internal and may change; these won't.
 */
export const CSS_HOOKS: { label: string; selector: string }[] = [
  { label: "Whole quiz", selector: ".pltq-quiz" },
  { label: "Banner", selector: ".pltq-banner" },
  { label: "Quiz title", selector: ".pltq-title" },
  { label: "Introduction", selector: ".pltq-intro" },
  { label: "Progress bar", selector: ".pltq-progress" },
  { label: "Question", selector: ".pltq-question" },
  { label: "Question title", selector: ".pltq-question-title" },
  { label: "Question help", selector: ".pltq-question-help" },
  { label: "Answer", selector: ".pltq-answer" },
  { label: "Selected answer", selector: ".pltq-answer[data-selected]" },
  { label: "Answer details", selector: ".pltq-answer-details" },
  { label: "Error message", selector: ".pltq-error" },
  { label: "Buttons", selector: ".pltq-button" },
  { label: "Primary button", selector: ".pltq-button--primary" },
  { label: "Review screen", selector: ".pltq-review" },
  { label: "Result", selector: ".pltq-result" },
  { label: "Response (best match)", selector: ".pltq-response" },
  { label: "Response title", selector: ".pltq-response-title" },
  { label: "Call-to-action button", selector: ".pltq-cta" },
  { label: "Runners-up", selector: ".pltq-runners-up" },
  { label: "Category profile", selector: ".pltq-profile" },
  { label: "Category bar", selector: ".pltq-bar" },
  { label: "Site header", selector: ".pltq-site-header" },
  { label: "Site footer", selector: ".pltq-site-footer" },
];

/** The block "Add element" inserts, and where the cursor goes in it. */
export function cssBlock(hook: { label: string; selector: string }): { text: string; cursor: number } {
  const head = `/* ${hook.label} */\n${hook.selector} {\n  `;
  return { text: `${head}\n}\n`, cursor: head.length };
}
