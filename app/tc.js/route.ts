import { NextResponse } from "next/server";

const script = `(function () {
  var scriptEl = document.currentScript;
  if (!scriptEl) return;

  var endpointOrigin = new URL(scriptEl.src, window.location.href).origin;
  var linkSlug = scriptEl.getAttribute("data-link-slug") || "";
  var storagePrefix = "trust-compression:";
  var viewerKey = storagePrefix + "viewer-id";
  var sessionKey = storagePrefix + "session-id";
  var touchKey = storagePrefix + "first-touch";

  function readOrCreate(key) {
    var current = window.localStorage.getItem(key);
    if (current) return current;
    var next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    return next;
  }

  function persistFirstTouch() {
    var url = new URL(window.location.href);
    var redirectSlug = url.searchParams.get("tc_link");
    var visitId = url.searchParams.get("tc_visit");
    var journeyId = url.searchParams.get("tc_journey");
    if (!redirectSlug && !linkSlug) return null;

    var existing = window.localStorage.getItem(touchKey);
    if (existing) {
      try {
        return JSON.parse(existing);
      } catch (_error) {
        window.localStorage.removeItem(touchKey);
      }
    }

    var firstTouch = {
      slug: redirectSlug || linkSlug,
      visitId: visitId || null,
      journeyId: journeyId || null,
      landedAt: new Date().toISOString(),
      landingUrl: window.location.href,
      referrer: document.referrer || null
    };

    window.localStorage.setItem(touchKey, JSON.stringify(firstTouch));
    return firstTouch;
  }

  function getTouch() {
    var persisted = persistFirstTouch();
    if (persisted) return persisted;
    var raw = window.localStorage.getItem(touchKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function send(eventType, metadata) {
    var touch = getTouch();
    var slug = (touch && touch.slug) || linkSlug;
    if (!slug) return;

    var payload = {
      slug: slug,
      journeyId: touch && touch.journeyId ? touch.journeyId : null,
      visitId: touch && touch.visitId ? touch.visitId : null,
      visitorId: readOrCreate(viewerKey),
      sessionId: readOrCreate(sessionKey),
      eventType: eventType,
      pageUrl: window.location.href,
      referrerUrl: document.referrer || null,
      metadata: metadata || {}
    };

    fetch(endpointOrigin + "/api/tracking-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () { return undefined; });
  }

  window.TrustCompression = {
    trackPageView: function (metadata) { send("page_view", metadata); },
    trackCtaClick: function (metadata) { send("cta_click", metadata); }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    send("page_view", { source: "tc.js" });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      send("page_view", { source: "tc.js" });
    }, { once: true });
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var element = target.closest("[data-tc-cta], [data-tc-event='cta_click']");
    if (!element) return;

    send("cta_click", {
      source: "tc.js",
      label: element.getAttribute("data-tc-label") || element.textContent || null,
      href: element instanceof HTMLAnchorElement ? element.href : null
    });
  }, { passive: true });
})();`;

export async function GET() {
  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
