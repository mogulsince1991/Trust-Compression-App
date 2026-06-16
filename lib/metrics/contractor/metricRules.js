export const METRIC_RULE_DEFINITIONS = {
  version: "0.1.0",
  timezone: "America/New_York",
  globalFilters: {
    excludedLeadTagPhrases: ["not_lead", "not a lead"],
  },
  classification: {
    soldJob: {
      statuses: ["sold", "approved", "contract signed"],
      soldDateFields: ["soldDate", "jobSoldDate", "Sold Date"],
      cancelledPattern: "cancel",
    },
    paidVendorAliases: [
      { vendor: "Salty's Media", aliases: ["wave", "salty", "saltys media", "salty's media"] },
      { vendor: "Detroit Radio LLC", aliases: ["detroit radio", "radio i/o guys", "radio io guys"] },
      { vendor: "Angi Leads", aliases: ["angi", "angi leads"] },
      { vendor: "FaceBook", aliases: ["fb ad", "facebook ad", "facebook ads", "meta ad", "meta ads"] },
      { vendor: "Google", aliases: ["google ad", "google ads", "google lsa", "local service ads", "lsa"] },
    ],
    paidSourcePatterns: [
      "(^|\\b)(fb|facebook|meta)\\s*ad(s)?\\b",
      "\\bgoogle\\s*(ad|ads|lsa)\\b",
      "\\blocal service ads?\\b",
      "\\bangi\\b",
      "\\bsalty'?s media\\b",
      "\\bwave\\b",
      "\\bradio i\\/?o guys\\b",
      "\\bdetroit radio\\b",
    ],
    organicSourcePatterns: [
      "\\borganic\\b",
      "\\breferral\\b",
      "\\bself gen\\b",
      "\\bwebsite direct\\b",
      "\\blive chat\\b",
      "\\bgoogle organic\\b",
      "\\bfb organic\\b",
    ],
  },
  matching: {
    joinPriority: ["email", "phone", "name"],
    splitCoupleNamesOnAnd: true,
  },
  closingOutcomeRules: [
    {
      reason: "One-Leg Appointment",
      pattern: "\\bone[- ]?leg\\b|decision[- ]?maker|spouse|husband|wife|partner|both.*present",
      description: "A required decision-maker was absent or unavailable.",
    },
    {
      reason: "Lost to Price Gap",
      pattern: "price|pricing|too high|expensive|budget|sticker|cost gap|half[- ]?price",
      description: "The quoted project cost appears to exceed the customer's expectations or budget.",
    },
    {
      reason: "Lost to Competitor",
      pattern: "competitor|another company|other quote|went with|chose .* else|lower bid",
      description: "The customer appears to have selected another provider or competing quote.",
    },
    {
      reason: "Not Ready / Timing",
      pattern: "not ready|timing|later|future|maybe one day|hold off|postpone|next year",
      description: "The customer is delaying or not ready to move forward.",
    },
    {
      reason: "Could Not Contact",
      pattern: "could not contact|no answer|left voicemail|no response|unresponsive|bad phone|dnd|stop",
      description: "Follow-up did not reach the customer or the customer stopped responding.",
    },
    {
      reason: "Canceled / No-Show",
      pattern: "cancel|cancelled|canceled|no[- ]?show|reschedule",
      description: "The appointment was canceled, missed, or repeatedly rescheduled.",
    },
    {
      reason: "Financing Issue",
      pattern: "financ|loan|approved|credit",
      description: "The deal appears blocked by financing or credit approval.",
    },
    {
      reason: "Pending Board / Family",
      pattern: "board|hoa|family|talk to|discuss|approval",
      description: "The decision is pending external approval or family discussion.",
    },
  ],
};

export function compilePattern(pattern, flags = "i") {
  return new RegExp(pattern, flags);
}
