(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;
  var key = "__trusttaleEmbedV1";
  if (window[key]) { window[key](); return; }
  function frames() {
    return Array.from(document.querySelectorAll("iframe[data-trusttale-embed]")).filter(function (frame) {
      try {
        var url = new URL(frame.src);
        return url.origin === origin && /^\/embed\/journey\/[^/]+\/?$/.test(url.pathname);
      } catch (_) { return false; }
    });
  }
  function initialize() {
    frames().forEach(function (frame) {
      frame.contentWindow.postMessage({ type: "trusttale:init", version: 1 }, origin);
    });
  }
  window[key] = initialize;
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.version !== 1) return;
    var frame = frames().find(function (candidate) { return candidate.contentWindow === event.source; });
    if (!frame) return;
    if (event.data.type === "trusttale:ready") {
      event.source.postMessage({ type: "trusttale:init", version: 1 }, origin);
    } else if (event.data.type === "trusttale:resize" && typeof event.data.height === "number" && Number.isFinite(event.data.height)) {
      var height = Math.max(320, Math.min(4000, Math.ceil(event.data.height)));
      frame.style.height = height + "px";
      frame.style.display = "block";
      frame.height = String(height);
    }
  });
  initialize();
})();
