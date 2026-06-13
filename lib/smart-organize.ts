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

const categoryRules: Array<{ category: SalesCategory; words: string[] }> = [
  { category: "Objection", words: ["cost", "price", "pricing", "expensive", "objection", "concern", "worry", "risk"] },
  { category: "Testimonial", words: ["testimonial", "review", "client", "customer", "story", "experience", "results"] },
  { category: "Product proof", words: ["demo", "proof", "before", "after", "walkthrough", "showcase", "result"] },
  { category: "Education", words: ["how", "why", "guide", "learn", "explained", "tips", "mistakes"] },
  { category: "Founder story", words: ["founder", "origin", "mission", "why we", "behind", "story"] },
  { category: "Case study", words: ["case study", "project", "transformation", "breakdown", "results"] },
  { category: "FAQ", words: ["faq", "question", "answer", "asked", "questions"] },
  { category: "Comparison", words: ["vs", "versus", "compare", "comparison", "alternative", "instead"] },
  { category: "Risk reversal", words: ["guarantee", "warranty", "promise", "risk", "safe", "refund"] }
];

export function classifyVideo(video: SmartVideoInput) {
  const text = [video.title, video.summary, ...(video.tags ?? [])].join(" ").toLowerCase();
  const matched = categoryRules.find((rule) => rule.words.some((word) => text.includes(word)));
  const category = matched?.category ?? "Education";

  let stage: FunnelStage = "Awareness";
  if (["Objection", "Comparison", "FAQ"].includes(category)) stage = "Consideration";
  if (["Testimonial", "Product proof", "Case study", "Risk reversal"].includes(category)) stage = "Decision";
  if (text.includes("onboarding") || text.includes("after") || text.includes("support")) stage = "Post-sale";

  const tags = Array.from(new Set([category, stage, ...(video.tags ?? [])])).slice(0, 8);
  return { category, stage, tags };
}

export function buildJourneyFallback(videos: SmartVideoInput[]) {
  const categories = videos.map((video) => classifyVideo(video).category);
  const hasProof = categories.some((category) => ["Testimonial", "Product proof", "Case study"].includes(category));
  const hasObjection = categories.includes("Objection") || categories.includes("Comparison");

  if (hasObjection) {
    return {
      title: "Answers before the call",
      heading: "A short proof path for the questions buyers usually hold back.",
      description: "Watch these in order to see the concerns, proof, and next steps more clearly.",
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

  return {
    title: "Start here",
    heading: "A clean path through the videos that matter most.",
    description: "A curated sequence to help you understand the work, the thinking, and the next step.",
    ctaLabel: "Continue"
  };
}
