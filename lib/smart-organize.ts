export type SalesCategory =
  | "Objection"
  | "Testimonial"
  | "Product proof"
  | "Education"
  | "Founder story"
  | "Case study"
  | "FAQ"
  | "Comparison"
  | "Risk reversal";

export type FunnelStage = "Awareness" | "Consideration" | "Decision" | "Post-sale";

export type SmartVideoInput = {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  duration_seconds?: number | null;
};

const categoryRules: Array<{ category: SalesCategory; stage: FunnelStage; weight: number; words: string[] }> = [
  {
    category: "Testimonial",
    stage: "Decision",
    weight: 8,
    words: ["testimonial", "review", "customer says", "client says", "homeowner says", "customer story", "client story", "happy customer", "recommend", "experience", "results"]
  },
  {
    category: "Case study",
    stage: "Decision",
    weight: 7,
    words: ["case study", "project", "transformation", "breakdown", "before and after", "before & after", "from start to finish", "finished project", "final reveal"]
  },
  {
    category: "Product proof",
    stage: "Decision",
    weight: 7,
    words: ["demo", "proof", "walkthrough", "showcase", "result", "results", "install", "installation", "build", "built", "tour", "see how", "finished", "reveal"]
  },
  {
    category: "Objection",
    stage: "Consideration",
    weight: 6,
    words: ["cost", "price", "pricing", "expensive", "cheap", "budget", "objection", "concern", "worry", "risk", "mess", "delay", "permit", "license", "insurance", "trust", "scam"]
  },
  {
    category: "Comparison",
    stage: "Consideration",
    weight: 5,
    words: [" vs ", "versus", "compare", "comparison", "alternative", "instead", "difference", "which is better", "pros and cons"]
  },
  {
    category: "Risk reversal",
    stage: "Decision",
    weight: 5,
    words: ["guarantee", "warranty", "promise", "no risk", "refund", "licensed", "insured", "safe", "protection", "what happens if"]
  },
  {
    category: "FAQ",
    stage: "Consideration",
    weight: 4,
    words: ["faq", "question", "answer", "asked", "questions", "what if", "how long", "can i", "do i need", "should i"]
  },
  {
    category: "Founder story",
    stage: "Awareness",
    weight: 4,
    words: ["founder", "owner", "origin", "mission", "why we", "behind", "our story", "meet", "family business", "team"]
  },
  {
    category: "Education",
    stage: "Awareness",
    weight: 2,
    words: ["how", "why", "guide", "learn", "explained", "tips", "mistakes", "things to know", "avoid", "what to expect"]
  }
];

export function classifyVideo(video: SmartVideoInput) {
  const text = normalize([video.title, video.summary, ...(video.tags ?? [])].join(" "));
  const scores = new Map<SalesCategory, { score: number; stage: FunnelStage }>();

  for (const rule of categoryRules) {
    for (const word of rule.words) {
      if (!text.includes(normalize(word))) continue;
      const current = scores.get(rule.category)?.score ?? 0;
      scores.set(rule.category, { score: current + rule.weight, stage: rule.stage });
    }
  }

  if ((video.duration_seconds ?? 0) <= 75 && /testimonial|review|customer|client|result|before|after/.test(text)) {
    const current = scores.get("Testimonial")?.score ?? 0;
    scores.set("Testimonial", { score: current + 3, stage: "Decision" });
  }

  const winner = Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score)[0];
  const category = winner?.[0] ?? "Education";
  let stage = winner?.[1].stage ?? "Awareness";

  if (text.includes("onboarding") || text.includes("maintenance") || text.includes("after care") || text.includes("support")) stage = "Post-sale";

  const tags = Array.from(new Set([category, stage, ...extractUsefulTags(text), ...(video.tags ?? [])])).slice(0, 10);
  return { category, stage, tags };
}

export function buildJourneyFallback(videos: SmartVideoInput[]) {
  const classified = videos.map((video) => classifyVideo(video));
  const categories = classified.map((item) => item.category);
  const hasProof = categories.some((category) => ["Testimonial", "Product proof", "Case study"].includes(category));
  const hasObjection = categories.includes("Objection") || categories.includes("Comparison") || categories.includes("FAQ");
  const hasRiskReversal = categories.includes("Risk reversal");
  const hasFounder = categories.includes("Founder story");

  if (hasObjection && hasProof) {
    return {
      title: "Proof before the call",
      heading: "See the answers, proof, and buyer context before we talk.",
      description: "A focused path that handles the common questions first, then shows the evidence behind the work.",
      ctaLabel: "Talk through the fit"
    };
  }

  if (hasObjection || hasRiskReversal) {
    return {
      title: "Handle the hard questions",
      heading: "A short path for the concerns buyers usually hold back.",
      description: "Watch these in order to see the risks, answers, and next steps more clearly.",
      ctaLabel: "Continue the conversation"
    };
  }

  if (hasProof) {
    return {
      title: "Proof worth seeing",
      heading: "A focused sequence of customer proof, results, and context.",
      description: "A quiet path through the videos that make the strongest case.",
      ctaLabel: "Talk through the fit"
    };
  }

  if (hasFounder) {
    return {
      title: "Why this work is different",
      heading: "A short introduction to the people, standards, and thinking behind the work.",
      description: "Start here for the story and context before getting into the details.",
      ctaLabel: "Start the conversation"
    };
  }

  return {
    title: "Start here",
    heading: "A clean path through the videos that matter most.",
    description: "A curated sequence to help you understand the work, the thinking, and the next step.",
    ctaLabel: "Continue"
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

function extractUsefulTags(text: string) {
  const tags: string[] = [];
  if (/price|pricing|cost|budget|expensive/.test(text)) tags.push("Pricing");
  if (/permit|license|licensed|insured|insurance/.test(text)) tags.push("Credibility");
  if (/before|after|transformation|reveal/.test(text)) tags.push("Transformation");
  if (/timeline|schedule|delay|how long/.test(text)) tags.push("Timeline");
  if (/mess|clean|cleanup|dust|disruption/.test(text)) tags.push("Disruption");
  if (/warranty|guarantee|promise/.test(text)) tags.push("Guarantee");
  return tags;
}
