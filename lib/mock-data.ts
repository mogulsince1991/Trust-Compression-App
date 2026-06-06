export type Video = {
  id: string;
  title: string;
  source: string;
  duration: string;
  type: string;
  image: string;
  summary: string;
  use: string;
  tags: string[];
};

export const videos: Video[] = [
  {
    id: "pricing-kitchen",
    title: "Kitchen pricing without surprises",
    source: "Instagram Reel",
    duration: "2:47",
    type: "Pricing",
    image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1000&q=80",
    summary: "Scope, selections, and hidden conditions explained before a homeowner commits.",
    use: "Send before the estimate conversation to reduce budget anxiety.",
    tags: ["Pricing", "Objection", "Kitchen", "Pre-call"]
  },
  {
    id: "founder-clarity",
    title: "Founder story: clarity comes first",
    source: "Facebook Video",
    duration: "4:12",
    type: "Founder",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1000&q=80",
    summary: "The company's standards, philosophy, and promise in a calm first-person story.",
    use: "Place first in a journey when the prospect has not met the team.",
    tags: ["Founder", "Trust", "Brand", "Intro"]
  },
  {
    id: "process-five-stages",
    title: "The remodel process in five stages",
    source: "YouTube",
    duration: "6:08",
    type: "Process",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80",
    summary: "Consultation, design, selections, construction, and final handoff.",
    use: "Send after inquiry so the prospect knows what happens next.",
    tags: ["Process", "Education", "Expectations"]
  },
  {
    id: "client-story",
    title: "Client story: living through the project",
    source: "Instagram Reel",
    duration: "3:36",
    type: "Testimonial",
    image: "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1000&q=80",
    summary: "A homeowner explains communication, comfort, and what surprised them.",
    use: "Use when prospects are worried about disruption during construction.",
    tags: ["Testimonial", "Proof", "Comfort"]
  },
  {
    id: "roof-claim",
    title: "Insurance roof claim walkthrough",
    source: "Facebook Page",
    duration: "5:28",
    type: "FAQ",
    image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
    summary: "Inspection, documentation, adjusters, approval, and common homeowner mistakes.",
    use: "Send to homeowners before the claim call to lower confusion.",
    tags: ["FAQ", "Insurance", "Roofing", "Objection"]
  },
  {
    id: "tax-misconceptions",
    title: "Tax planning misconceptions",
    source: "YouTube",
    duration: "7:19",
    type: "Education",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1000&q=80",
    summary: "Common objections around timing, complexity, and whether planning is worth it.",
    use: "Send when a prospect thinks tax strategy is only for year-end.",
    tags: ["Education", "Objection", "Finance"]
  }
];
