/*
 * PLT Quiz embed helper. Add after the quiz <iframe>:
 *   <script src="https://YOUR-QUIZ-SITE/embed.js" async></script>
 * It sizes each quiz iframe to its content and re-dispatches the quiz's
 * events (quiz:answer, quiz:complete, quiz:restart) on the iframe element.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;

  function quizFrameFor(source) {
    var frames = document.getElementsByTagName("iframe");
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.contentWindow !== source) continue;
      try {
        var url = new URL(frame.src, location.href);
        if (url.origin === origin && url.pathname.indexOf("/embed/") === 0) return frame;
      } catch {
        /* not a URL */
      }
    }
    return null;
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || typeof data.type !== "string") return;
    var frame = quizFrameFor(event.source);
    if (!frame) return;
    if (data.type === "pltq:resize" && typeof data.height === "number" && data.height > 0) {
      frame.style.height = Math.ceil(data.height) + "px";
      frame.style.minHeight = "0";
    } else if (data.type === "pltq:event" && /^quiz:[a-z]+$/.test(data.name)) {
      frame.dispatchEvent(new CustomEvent(data.name, { bubbles: true, detail: data.detail }));
    }
  });
})();
