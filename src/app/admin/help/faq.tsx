import type { ReactNode } from "react";

/**
 * Help content for staff. Button and section names here must match the admin
 * screens; update this file when a label changes.
 */
export type FaqItem = { id: string; question: string; answer: ReactNode };
/** Super Admin-only sections are hidden from Admins. */
export type FaqSection = { id: string; title: string; superAdminOnly?: boolean; items: FaqItem[] };

const Steps = ({ children }: { children: ReactNode }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
const Ui = ({ children }: { children: ReactNode }) => <strong className="font-semibold">{children}</strong>;

export const FAQ: FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        id: "how-it-works",
        question: "How does a quiz work?",
        answer: (
          <>
            <p>
              A quiz has <Ui>categories</Ui> (for example &ldquo;Outdoors&rdquo; or &ldquo;Hands-on&rdquo;),{" "}
              <Ui>questions</Ui> whose answers carry weights for those categories, and <Ui>responses</Ui> (the
              results, such as a green career) that also carry category weights.
            </p>
            <p>
              As someone answers, their picks add up to a category profile. The response whose profile is closest
              to theirs is their best match, and the next closest are shown as runners-up.
            </p>
          </>
        ),
      },
      {
        id: "create-quiz",
        question: "How do I create a new quiz?",
        answer: (
          <Steps>
            <li>
              Go to <Ui>Quizzes</Ui> and fill in <Ui>New quiz</Ui> (title and URL slug), then click{" "}
              <Ui>Create quiz</Ui>.
            </li>
            <li>
              In the builder, start on <Ui>Categories</Ui>. <Ui>Start with a suggested set</Ui> fills in a ready-made
              list you can edit.
            </li>
            <li>
              Add questions on <Ui>Questions</Ui>, then results on <Ui>Responses</Ui>.
            </li>
            <li>
              Try it on <Ui>Simulate</Ui> and clear any warnings on <Ui>Health</Ui>.
            </li>
            <li>
              Open <Ui>Settings</Ui> (link at the top right of the builder) and click <Ui>Publish</Ui>.
            </li>
          </Steps>
        ),
      },
      {
        id: "builder-vs-settings",
        question: "What's the difference between the builder and Settings?",
        answer: (
          <p>
            The <Ui>builder</Ui> holds the quiz content and scoring: categories, questions, responses, simulation and
            health checks. <Ui>Settings</Ui> holds everything around it: title and introduction, publishing, delivery
            and embedding, banner, CSS, quiz codes, respondent options, scoring options, copy and export, and delete.
          </p>
        ),
      },
    ],
  },
  {
    id: "building",
    title: "Building a quiz",
    items: [
      {
        id: "add-questions",
        question: "How do I add a question and set its weights?",
        answer: (
          <Steps>
            <li>
              Open the builder → <Ui>Questions</Ui> and add a question.
            </li>
            <li>
              Choose <Ui>Single choice</Ui> or <Ui>Multiple choice</Ui>. For multiple choice you can set{" "}
              <Ui>Min picks</Ui> and <Ui>Max picks</Ui>.
            </li>
            <li>Type the answers. Each answer is a row in the weight grid, and each category is a column.</li>
            <li>
              Enter how strongly each answer points to each category. Leave a cell empty for &ldquo;no
              effect&rdquo;. Arrow keys move around the grid, and the row and column totals update as you type.
            </li>
            <li>
              Click <Ui>Save question</Ui>, or <Ui>Save all</Ui> to save every changed card at once.
            </li>
          </Steps>
        ),
      },
      {
        id: "question-parts",
        question: "Can I ask questions that don't count towards the result?",
        answer: (
          <>
            <p>
              Yes. On a question card, set <Ui>When it&rsquo;s asked</Ui> to one of these. Neither kind has weights or
              affects the result, and both answers are saved with the submission.
            </p>
            <ul className="list-disc pl-5">
              <li>
                <Ui>Before the quiz (not scored)</Ui>, for things like grade or school. These are asked first, in
                the same flow as the scored questions.
              </li>
              <li>
                <Ui>Follow-up after the result (not scored)</Ui>, for things like &ldquo;Was this useful?&rdquo;.
                These appear under the result, after the respondent has seen their match. Skipping them never
                changes the result.
              </li>
            </ul>
            <p>
              The Questions tab groups cards by when they&rsquo;re asked. A submission&rsquo;s page shows these
              answers in their own sections, and the CSV export has a <Ui>Part</Ui> column. Like any content change,
              it&rsquo;s a draft until you publish.
            </p>
          </>
        ),
      },
      {
        id: "languages",
        question: "How do I offer the quiz in Spanish or French?",
        answer: (
          <Steps>
            <li>
              Open the builder → <Ui>Translations</Ui>, pick the language and translate each text next to its English.
              Click <Ui>Save translations</Ui> for each section. Anything left empty shows in English.
            </li>
            <li>
              In quiz settings → <Ui>Languages</Ui>, tick the language and click <Ui>Save languages</Ui>. Add the
              banner&apos;s alt text in that language too.
            </li>
            <li>
              Click <Ui>Publish changes</Ui>: translations are part of the draft, like any content change.
            </li>
            <li>
              Respondents get their browser&apos;s language when the quiz offers it, and can switch with the
              <Ui> Language</Ui> menu at the top of the quiz. To link to a language, add <code>?lang=es</code> or{" "}
              <code>?lang=fr</code> to the quiz&apos;s address (or its embed frame).
            </li>
            <li>
              If you change the English later, the translation is marked <Ui>Needs review</Ui> until you update it
              or click <Ui>Mark as reviewed</Ui>.
            </li>
          </Steps>
        ),
      },
      {
        id: "languages-scoring",
        question: "Does the language change the result?",
        answer: (
          <p>
            No. Every language has the same questions, answers and weights, so the same answers give the same result.
            Submissions record the language they were taken in (a <Ui>Language</Ui> filter and CSV column), and
            store question and answer text in English so reports compare like with like. Buttons and messages are
            translated by the developers; ask them to add another language.
          </p>
        ),
      },
      {
        id: "reorder",
        question: "How do I change the order of questions, answers or categories?",
        answer: (
          <p>
            Drag the handle next to the item, or focus the handle, press Space, then use the arrow keys. Save any unsaved changes
            first: reordering is blocked while a card has unsaved edits.
          </p>
        ),
      },
      {
        id: "responses",
        question: "How do I set up the responses (results)?",
        answer: (
          <Steps>
            <li>
              Open <Ui>Responses</Ui>. Each row is a response and each column a category.
            </li>
            <li>
              Give each response weights for the categories that describe it. <Ui>Normalize to 10</Ui> scales a
              row so its weights add up to 10, which keeps responses comparable.
            </li>
            <li>
              Open a response to write its summary, description and call to action (button label and link). Its
              Category Profile shows the bars respondents will see.
            </li>
          </Steps>
        ),
      },
      {
        id: "similar-warning",
        question: "Why does it say two responses are too similar?",
        answer: (
          <p>
            Their category weights point the same way, so almost any set of answers that matches one also matches
            the other. Make their weights more different, for example by giving each a category the other doesn&apos;t
            have.
          </p>
        ),
      },
      {
        id: "images",
        question: "How do I add an image?",
        answer: (
          <>
            <p>
              In any rich-text editor (introduction, question help, answer details, response descriptions), click{" "}
              <Ui>Image</Ui>, choose a file and add alt text describing it (leave alt text empty only for a purely
              decorative image).
            </p>
            <p>
              PNG, JPEG, WebP or GIF up to 2 MB. SVG isn&apos;t allowed. For an image above the quiz title, use{" "}
              <Ui>Settings → Banner</Ui>.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "testing",
    title: "Testing and publishing",
    items: [
      {
        id: "simulate",
        question: "How do I check a quiz gives sensible results?",
        answer: (
          <>
            <p>
              Use <Ui>Simulate</Ui>. Answer as a respondent would and see every response ranked, with the category
              profile.
            </p>
            <p>
              <Ui>Find answers for a response</Ui> searches for answers that lead to a given response. If it
              can&apos;t find any, that response is hard or impossible to reach and needs different weights.
            </p>
          </>
        ),
      },
      {
        id: "health",
        question: "What does the number on the Health tab mean?",
        answer: (
          <p>
            It&apos;s the number of warnings: things like questions with no answers, answers with no weights,
            responses with no weights, responses that are too similar, or categories no answer can reach. Each
            warning links to where you can fix it. You can still publish with warnings, but you&apos;ll be asked to
            confirm.
          </p>
        ),
      },
      {
        id: "publish",
        question: "How do I publish or unpublish a quiz?",
        answer: (
          <>
            <p>
              Open the quiz&apos;s <Ui>Settings</Ui> → <Ui>Publishing</Ui> and click <Ui>Publish</Ui>. The quiz then
              appears on the home page and at its quiz page link, shown under Publishing.
            </p>
            <p>
              <Ui>Unpublish</Ui> takes it offline again. Submissions are kept. Drafts are only visible to staff.
            </p>
          </>
        ),
      },
      {
        id: "edit-live",
        question: "Can I edit a quiz after it's published?",
        answer: (
          <p>
            Yes. Changes go live as soon as you save them. Finished submissions keep the scores they were given. If
            you&apos;re making big changes, consider <Ui>Duplicate</Ui> to work on a draft copy, then publish the copy
            when it&apos;s ready.
          </p>
        ),
      },
    ],
  },
  {
    id: "sharing",
    title: "Sharing and delivery",
    items: [
      {
        id: "embed",
        question: "How do I put a quiz on another website?",
        answer: (
          <Steps>
            <li>Publish the quiz.</li>
            <li>
              In <Ui>Settings → Delivery</Ui>, copy the embed snippet.
            </li>
            <li>Paste it into the other page&apos;s HTML. The frame resizes itself to fit the quiz.</li>
            <li>
              If embedding is limited to certain sites, ask a Super Admin to add that site to the list of sites
              allowed to embed quizzes.
            </li>
          </Steps>
        ),
      },
      {
        id: "layout",
        question: "Can respondents see all the questions at once?",
        answer: (
          <p>
            Yes. In <Ui>Settings → Delivery</Ui>, switch from <Ui>One at a time</Ui> to <Ui>All on one page</Ui>.
            The <Ui>Focused</Ui> page template hides the site header and footer for a distraction-free page.
          </p>
        ),
      },
      {
        id: "quiz-codes",
        question: "How do I give a class or mailer its own link?",
        answer: (
          <Steps>
            <li>
              In <Ui>Settings → Quiz codes</Ui>, use the suggested code or type your own, add a label (such as
              &ldquo;Ms Lee, period 3&rdquo;) and optional opening and closing dates, then click{" "}
              <Ui>Create code</Ui>.
            </li>
            <li>
              Share the short link (<code>/q/CODE</code>), download the <Ui>QR code</Ui>, or print the{" "}
              <Ui>Flyer</Ui>.
            </li>
            <li>The codes list shows how many people started and finished with each code.</li>
          </Steps>
        ),
      },
      {
        id: "teacher-link",
        question: "How can a teacher see how their class did?",
        answer: (
          <p>
            Copy the code&apos;s <Ui>Teacher link</Ui> and send it to them. It shows counts, the share of each best
            match and the average category profile once 5 people have finished, with no names, emails or individual
            answers. <Ui>New teacher link</Ui> stops the old one working.
          </p>
        ),
      },
      {
        id: "require-code",
        question: "Can I make a quiz only open to people with a code?",
        answer: (
          <p>
            Yes. In <Ui>Settings → Quiz codes</Ui>, tick <Ui>Require a quiz code to start</Ui> and click <Ui>Save code setting</Ui>.
            The quiz page then asks for a code instead of showing Start. People already partway through can still
            finish.
          </p>
        ),
      },
      {
        id: "share-result",
        question: "How do respondents print or share their result?",
        answer: (
          <p>
            The result screen has <Ui>Print</Ui>, <Ui>Copy link</Ui> (or <Ui>Share</Ui> on phones) and{" "}
            <Ui>Printable page</Ui>. To save a PDF, they print and choose &ldquo;Save as PDF&rdquo;.
          </p>
        ),
      },
    ],
  },
  {
    id: "look",
    title: "Look and feel",
    items: [
      {
        id: "respondent-options",
        question: "How do I turn the progress bar, auto-advance or retakes on or off?",
        answer: (
          <p>
            In <Ui>Settings → Respondent options</Ui>: <Ui>Show a progress bar</Ui>,{" "}
            <Ui>Move on after a single-choice answer</Ui> and <Ui>Allow retakes</Ui>. Click{" "}
            <Ui>Save respondent options</Ui>.
          </p>
        ),
      },
      {
        id: "custom-css",
        question: "How do I change colours or fonts?",
        answer: (
          <>
            <p>
              Use <Ui>Settings → Quiz CSS</Ui> for one quiz. A Super Admin can also set site-wide CSS for every
              quiz; the quiz&apos;s CSS wins over it.
            </p>
            <p>
              <Ui>Add element</Ui> inserts a ready-made rule for parts of the quiz such as answers, buttons or the
              result. Admin pages are never affected.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "copying",
    title: "Copying and moving quizzes",
    items: [
      {
        id: "duplicate",
        question: "How do I copy a quiz?",
        answer: (
          <p>
            Click <Ui>Duplicate</Ui> on the Quizzes list or in <Ui>Settings → Copy and export</Ui>. You get
            &ldquo;Copy of …&rdquo; as a draft with all its content and settings, but no submissions.
          </p>
        ),
      },
      {
        id: "export-import",
        question: "How do I move a quiz to another site?",
        answer: (
          <Steps>
            <li>
              In <Ui>Settings → Copy and export</Ui>, click <Ui>Export quiz file</Ui> to download a{" "}
              <code>.quiz.json</code> file (images included).
            </li>
            <li>
              On the other site, go to <Ui>Quizzes → Import a quiz</Ui> and choose the file. It arrives as a new
              draft.
            </li>
            <li>Files can be up to 4 MB, so shrink large images first if the import is refused.</li>
          </Steps>
        ),
      },
      {
        id: "delete-quiz",
        question: "Why can't I delete a quiz?",
        answer: (
          <p>
            Quizzes with submissions can&apos;t be deleted, so results aren&apos;t lost by accident. Unpublish it
            instead, or ask a Super Admin to delete its submissions first.
          </p>
        ),
      },
      {
        id: "activity",
        question: "How do I see who changed something?",
        answer: (
          <p>
            Open <Ui>Activity</Ui> and filter by quiz, person, type or date. Each quiz&apos;s Settings page also
            lists its recent changes.
          </p>
        ),
      },
    ],
  },
  {
    id: "sign-in",
    title: "Sign-in and roles",
    items: [
      {
        id: "roles",
        question: "What can Admins and Super Admins do?",
        answer: (
          <p>
            <Ui>Admins</Ui> create and edit quizzes and see quiz activity. <Ui>Super Admins</Ui> can also see
            submissions, manage staff, and change site settings such as site-wide CSS and which sites may embed
            quizzes.
          </p>
        ),
      },
      {
        id: "no-email",
        question: "I'm not getting the sign-in email. What now?",
        answer: (
          <>
            <p>Check your spam folder and that you&apos;re using the exact email you were invited with.</p>
            <p>
              While PIN sign-in is turned on, a Super Admin can give you a PIN. Use <Ui>Sign in with PIN</Ui> on the
              sign-in page with your email and that PIN.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "super-admin",
    title: "Super Admin",
    superAdminOnly: true,
    items: [
      {
        id: "view-submissions",
        question: "Where do I see who took a quiz?",
        answer: (
          <p>
            Open <Ui>Submissions</Ui>. Filter by quiz, matched response, code, date or search text, and click a row
            for the full detail: ranking, category profile and every answer with its weights.
          </p>
        ),
      },
      {
        id: "export-csv",
        question: "How do I download results to a spreadsheet?",
        answer: (
          <>
            <p>
              On <Ui>Submissions</Ui>, set the filters you want, then choose a CSV download:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Ui>Long</Ui>: one row per answered question.
              </li>
              <li>
                <Ui>Wide</Ui>: one row per attempt with a score for each category. Pick a quiz in the filters
                first.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "delete-submission",
        question: "How do I remove someone's submission?",
        answer: (
          <p>
            In <Ui>Submissions</Ui>, tick it and click <Ui>Delete selected</Ui>, or open it and delete it from its
            page. That person can then start the quiz fresh. To only stop a shared result link working, use{" "}
            <Ui>Turn off share link</Ui> on the submission&apos;s page.
          </p>
        ),
      },
      {
        id: "invite",
        question: "How do I add or remove an Admin?",
        answer: (
          <p>
            Go to <Ui>Staff</Ui>, enter their email and click <Ui>Invite Admin</Ui>. They can then sign in with that
            email. <Ui>Disable</Ui> or remove them to take access away; they&apos;re signed out straight away.
          </p>
        ),
      },
      {
        id: "pin",
        question: "How do I give an Admin a sign-in PIN?",
        answer: (
          <>
            <p>
              On <Ui>Staff</Ui>, click <Ui>Create PIN</Ui> next to the Admin and pass the PIN on. It&apos;s only shown
              once; <Ui>Reset PIN</Ui> makes a new one and signs them out everywhere.
            </p>
            <p>
              Before launch, click <Ui>Revoke all PINs</Ui> so everyone signs in by email.
            </p>
          </>
        ),
      },
      {
        id: "embed-sites",
        question: "How do I control which sites can embed quizzes?",
        answer: (
          <p>
            On the main <Ui>Settings</Ui> page, under <Ui>Embedding and API access</Ui>, list the sites in{" "}
            <Ui>Sites allowed to embed quizzes</Ui> (leave it empty to allow any site) and click <Ui>Save</Ui>.
            Changes take up to a minute to apply. Sites that run their own front end go in{" "}
            <Ui>Sites allowed to call the quiz API from the browser</Ui>.
          </p>
        ),
      },
      {
        id: "site-css",
        question: "How do I style every quiz at once?",
        answer: (
          <p>
            On the main <Ui>Settings</Ui> page, add rules under <Ui>Site-wide CSS</Ui> and click{" "}
            <Ui>Save site CSS</Ui>. A quiz&apos;s own Quiz CSS still wins over it.
          </p>
        ),
      },
    ],
  },
];
