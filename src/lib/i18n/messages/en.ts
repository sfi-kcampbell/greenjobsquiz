/**
 * Respondent-facing text in English: the source catalog. Other languages
 * must have exactly these keys (the `Messages` type enforces it). Functions
 * take the numbers and names a message needs, so each language can word
 * plurals and order in its own way.
 */
export const en = {
  // Start and loading
  start: "Start",
  loading: "Loading…",
  questionCount: (n: number) => (n === 1 ? "1 question" : `${n} questions`),
  stillTakeQuiz: "You can still take the quiz.",
  language: "Language",
  retry: "Retry",
  tryAgain: "Try again",
  noQuestions: "This quiz has no questions yet.",

  // Moving through the quiz
  next: "Next",
  back: "Back",
  reviewAnswers: "Review answers",
  backToReview: "Back to review",
  seeMyResult: "See my result",
  workingOut: "Working out your result…",
  announceQuestion: (n: number, total: number) => `Question ${n} of ${total}`,
  announceReview: "Check your answers before seeing your result.",
  announceResult: "Your result is ready.",

  // A question
  questionOf: (n: number, total: number) => `Question ${n} of ${total}`,
  optional: " (optional)",
  chooseExactly: (n: number) => `Choose ${n}.`,
  chooseRange: (min: number, max: number) => `Choose ${min} to ${max}.`,
  chooseAnswer: "Choose an answer to continue.",
  chooseAtLeast: (min: number, count: number) => `Choose at least ${min} answers. You've chosen ${count}.`,
  chooseUpTo: (max: number, extra: number) => `You can choose up to ${max}. Untick ${extra} to continue.`,
  answerToSeeResult: "Please answer this question to see your result.",

  // Progress and resume
  progressLabel: "Questions answered",
  answeredOf: (answered: number, total: number) => `${answered} of ${total} answered`,
  welcomeBack: "Welcome back",
  resumeProgress: (answered: number, total: number) =>
    `You're ${answered} of ${total} through. Pick up where you left off, or start again.`,
  resume: "Resume",
  startOver: "Start over",
  startingOver: "Starting over…",

  // Review
  checkYourAnswers: "Check your answers",
  questionNumber: (n: number) => `Question ${n}`,
  notAnswered: "Not answered",
  change: "Change",
  changeAnswerTo: (n: number) => ` answer to question ${n}`,

  // Quiz codes
  codeLabel: "Quiz code",
  codeHint: "This quiz needs a code. You'll find it on your mailer, flyer or from your teacher.",
  enterCode: "Enter your quiz code.",
  checking: "Checking…",
  continue: "Continue",
  codeNotFound: "That code isn't recognized. Check it and try again.",
  codeNotOpenYet: "That code isn't open yet.",
  codeClosed: "That code has closed.",
  codeOpensOn: (date: string) => `It opens on ${date}.`,
  codeProblemTitle: "We couldn't open that quiz code",
  tooManyCodes: "Too many codes tried from here. Please wait a while and try again.",
  seeAllQuizzes: "See all quizzes",

  // The result
  bestMatch: "Your best match",
  percentMatch: (p: number) => `${p}% match`,
  itWasClose: "It was close: your next match scored almost the same, so take a look below too.",
  insufficientData: "Your answers didn't point clearly to one match, so here's a good place to start.",
  noMatchFound: "We couldn't find a match from your answers.",
  alsoAGoodFit: "Also a good fit",
  yourProfile: "Your profile",
  opensInNewTab: " (opens in a new tab)",
  earlierResults: "Your earlier results",
  attemptN: (n: number) => `Attempt ${n}: `,
  noMatch: "No match",
  takeItAgain: "Take it again",
  resultStaysSaved: "This result stays saved.",

  // Keeping and sharing
  keepOrShare: "Keep or share your result",
  print: "Print",
  share: "Share",
  copyLink: "Copy link",
  linkCopied: "Link copied.",
  copyBelow: "Copy the link below.",
  printablePage: "Printable page",
  downloadImage: "Download image",
  anyoneWithLink: "Anyone with this link can see this result:",
  shareTitle: "My quiz result",

  // Follow-up questions
  followUpHeading: "A few more questions",
  followUpNote: "These don't change your result.",
  followUpThanks: "Thanks, your answers were saved.",
  changeMyAnswers: "Change my answers",
  sending: "Sending…",
  sendAnswers: "Send answers",

  // The shared and printable result page
  quizResult: "Quiz result",
  takenOn: (date: string) => `Taken ${date}`,
  printOrSave: "Print or save as PDF",
  takeThisQuiz: "Take this quiz",
  resultLinkInvalid: "This result link isn't valid",
  resultLinkInvalidHint: "It may have been mistyped, or removed.",
  quizUnavailable: "This quiz isn't available",
  quizUnavailableHint: "It may have been unpublished, or the link may be mistyped.",

  // Share card and link previews
  cardLead: "My best match",
  cardNoMatch: "Take the quiz to find your match",
  cardAltNoMatch: (quiz: string) => `${quiz}: take the quiz to find your match`,
  cardAlt: (quiz: string, title: string, percent: number | null) =>
    `${quiz} result: my best match is ${title}${percent !== null ? `, a ${percent}% match` : ""}.`,
  metaTitle: (title: string, quiz: string) => `I got ${title} on ${quiz}`,
  metaTitleNoMatch: (quiz: string) => `My result on ${quiz}`,
  metaDescription: (quiz: string) => `See which careers fit you best. Take ${quiz} too.`,
  metaDescriptionNoMatch: (quiz: string) => `Take ${quiz} to find careers that fit you.`,

  // Problems
  networkError: "We couldn't reach the server. Check your connection and try again.",
  serverError: "Something went wrong on our side. Please try again in a moment.",
  saveNetworkError: "We couldn't save your last answer. Check your connection.",
  saveServerError: "We couldn't save your last answer because of a problem on our side. Your answers are kept on this page.",
  /** API errors by code (the server's English message is used for any code not here). */
  errors: {
    quiz_code_required: "This quiz needs a quiz code to start.",
    quiz_retake_not_allowed: "This quiz can only be taken once.",
    quiz_not_found: "That quiz isn't available.",
    quiz_result_not_found: "That result link isn't valid.",
    quiz_session_not_found: "Answer at least one question first.",
    quiz_already_submitted: "This attempt was already submitted. Start over to answer again.",
    quiz_not_submitted: "Finish the quiz first, then answer the follow-up questions.",
    quiz_missing_answers: "Some required questions haven't been answered.",
    quiz_rate_limited: "Too many requests. Please wait a moment and try again.",
  } as Record<string, string>,
};

export type Messages = typeof en;
