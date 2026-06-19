import { NextResponse } from "next/server";

const script = `(function () {
  var scriptEl = document.currentScript;
  if (!scriptEl) return;

  var endpointOrigin = new URL(scriptEl.src, window.location.href).origin;
  var defaultLinkSlug = scriptEl.getAttribute("data-link-slug") || "";
  var storagePrefix = "trust-compression:";
  var viewerKey = storagePrefix + "viewer-id";
  var sessionKey = storagePrefix + "session-id";
  var touchKey = storagePrefix + "first-touch";
  var profileKey = storagePrefix + "profile";
  var pageViewKey = storagePrefix + "last-page-view";

  function safeStorage(storageType) {
    try {
      var storage = storageType === "session" ? window.sessionStorage : window.localStorage;
      var probe = storagePrefix + "probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return storage;
    } catch (_error) {
      return null;
    }
  }

  var local = safeStorage("local");
  var session = safeStorage("session");

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "tc-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function readOrCreate(storage, key) {
    if (!storage) return createId();
    var current = storage.getItem(key);
    if (current) return current;
    var next = createId();
    storage.setItem(key, next);
    return next;
  }

  function readJson(storage, key) {
    if (!storage) return null;
    var raw = storage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      storage.removeItem(key);
      return null;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage) return;
    storage.setItem(key, JSON.stringify(value));
  }

  function getProfile() {
    return readJson(local, profileKey) || {};
  }

  function setProfile(profile) {
    var next = Object.assign({}, getProfile(), profile || {});
    writeJson(local, profileKey, next);
    return next;
  }

  function getCurrentUrl() {
    try {
      return new URL(window.location.href);
    } catch (_error) {
      return null;
    }
  }

  function parseQuery(url) {
    var next = {};
    if (!url) return next;

    Array.from(url.searchParams.entries()).slice(0, 30).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (!key) return;
      next[key] = value;
    });

    return next;
  }

  function getTouchFromUrl() {
    var url = getCurrentUrl();
    if (!url) return null;

    var redirectSlug = url.searchParams.get("tc_link");
    var visitId = url.searchParams.get("tc_visit");
    var journeyId = url.searchParams.get("tc_journey");
    if (!redirectSlug && !defaultLinkSlug) return null;

    return {
      slug: redirectSlug || defaultLinkSlug,
      visitId: visitId || null,
      journeyId: journeyId || null,
      landedAt: new Date().toISOString(),
      landingUrl: url.toString(),
      landingPath: url.pathname,
      landingHost: url.hostname,
      referrer: document.referrer || null,
      query: parseQuery(url),
      utm: {
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        term: url.searchParams.get("utm_term"),
        content: url.searchParams.get("utm_content")
      }
    };
  }

  function persistFirstTouch() {
    var existing = readJson(local, touchKey);
    var fromUrl = getTouchFromUrl();

    if (fromUrl && (!existing || fromUrl.visitId || fromUrl.slug !== existing.slug)) {
      writeJson(local, touchKey, fromUrl);
      return fromUrl;
    }

    if (existing) return existing;

    if (fromUrl) {
      writeJson(local, touchKey, fromUrl);
      return fromUrl;
    }

    return null;
  }

  function getTouch() {
    return persistFirstTouch() || readJson(local, touchKey);
  }

  function getPageContext() {
    var url = getCurrentUrl();
    return {
      title: document.title || null,
      path: url ? url.pathname : null,
      host: url ? url.hostname : null,
      query: parseQuery(url)
    };
  }

  function sendPayload(payload) {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon && payload.eventType !== "page_view") {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpointOrigin + "/api/tracking-events", blob)) return;
      } catch (_error) {
      }
    }

    fetch(endpointOrigin + "/api/tracking-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      credentials: "omit"
    }).catch(function () { return undefined; });
  }

  function normalizeEventType(eventType) {
    var value = String(eventType || "").trim().toLowerCase();
    if (!value) return null;
    var aliases = {
      cta: "cta_click",
      click: "cta_click",
      submit: "form_submit",
      lead: "opt_in",
      booked: "booking",
      sale: "purchase"
    };

    return aliases[value] || value;
  }

  function send(eventType, metadata, overrides) {
    var normalized = normalizeEventType(eventType);
    if (!normalized) return;

    var touch = getTouch();
    var slug = overrides && overrides.slug ? overrides.slug : ((touch && touch.slug) || defaultLinkSlug);
    if (!slug) return;

    var mergedMetadata = Object.assign({}, getPageContext(), getProfile(), metadata || {});
    var payload = {
      slug: slug,
      journeyId: overrides && overrides.journeyId ? overrides.journeyId : (touch && touch.journeyId ? touch.journeyId : null),
      visitId: overrides && overrides.visitId ? overrides.visitId : (touch && touch.visitId ? touch.visitId : null),
      visitorId: readOrCreate(local, viewerKey),
      sessionId: readOrCreate(session || local, sessionKey),
      eventType: normalized,
      eventLabel: mergedMetadata.label || null,
      eventValue: typeof mergedMetadata.value === "number" ? mergedMetadata.value : null,
      eventCurrency: typeof mergedMetadata.currency === "string" ? mergedMetadata.currency : null,
      occurredAt: new Date().toISOString(),
      pageUrl: window.location.href,
      referrerUrl: document.referrer || null,
      metadata: Object.assign({}, mergedMetadata, {
        firstTouch: touch,
        source: mergedMetadata.source || "tc.js"
      })
    };

    sendPayload(payload);
  }

  function trackPageView(metadata) {
    var key = window.location.pathname + window.location.search;
    if (session && session.getItem(pageViewKey) === key) return;
    if (session) session.setItem(pageViewKey, key);
    send("page_view", metadata);
  }

  function datasetMetadata(element) {
    if (!element) return {};
    return {
      label: element.getAttribute("data-tc-label") || element.textContent || null,
      href: element instanceof HTMLAnchorElement ? element.href : null,
      value: element.getAttribute("data-tc-value") ? Number(element.getAttribute("data-tc-value")) : null,
      currency: element.getAttribute("data-tc-currency") || null
    };
  }

  function trackDatasetEvent(element, fallbackType) {
    var eventType = element.getAttribute("data-tc-event") || fallbackType;
    send(eventType, datasetMetadata(element));
  }

  window.TrustCompression = {
    identify: function (profile, options) {
      var next = setProfile(profile);
      if (!options || options.flush !== false) {
        send("custom", Object.assign({}, next, { label: "identify", action: "identify" }));
      }
      return next;
    },
    track: function (eventType, metadata) {
      send(eventType, metadata);
    },
    trackPageView: function (metadata) {
      trackPageView(metadata || { source: "tc.js" });
    },
    trackCtaClick: function (metadata) {
      send("cta_click", metadata);
    },
    trackFormSubmit: function (metadata) {
      send("form_submit", metadata);
    },
    trackOptIn: function (metadata) {
      send("opt_in", metadata);
    },
    trackBooking: function (metadata) {
      send("booking", metadata);
    },
    trackPurchase: function (value, metadata) {
      send("purchase", Object.assign({}, metadata || {}, { value: typeof value === "number" ? value : null }));
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    trackPageView({ source: "tc.js" });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      trackPageView({ source: "tc.js" });
    }, { once: true });
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var trackedElement = target.closest("[data-tc-event], [data-tc-cta]");
    if (!trackedElement) return;
    trackDatasetEvent(trackedElement, trackedElement.hasAttribute("data-tc-cta") ? "cta_click" : "custom");
  }, { passive: true });

  document.addEventListener("submit", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    if (!target.hasAttribute("data-tc-form") && !target.hasAttribute("data-tc-event")) return;

    trackDatasetEvent(target, "form_submit");
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
