import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildJourneyFallback, classifyVideo } from "@/lib/smart-organize";

type VideoInput = {
  title: string;
  summary?: string | null;
  source_platform?: string | null;
  duration_seconds?: number | null;
  tags?: string[] | null;
};

type GenerateRequest = {
  videos?: VideoInput[];
  prompt?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const videos = (body.videos ?? []).slice(0, 20);
  const fallback = buildJourneyFallback(videos);
  const classifications = videos.map((video) => ({
    title: video.title,
    ...classifyVideo(video)
  }));

  const system =
    "You generate concise buyer-facing video journey landing-page copy for a premium, minimal trust library. Return JSON only with title, heading, description, ctaLabel, orderedTitles, and groups. Keep the language calm and specific.";
  const user = JSON.stringify({
    userPrompt: body.prompt ?? "",
    videos: videos.map((video) => ({
      title: video.title,
      summary: video.summary,
      sourcePlatform: video.source_platform,
      durationSeconds: video.duration_seconds,
      tags: video.tags
    })),
    ruleBasedClassifications: classifications
  });

  try {
    const generated = await generateWithGateway(system, user);
    return NextResponse.json({ ...fallback, ...generated, classifications, source: "vercel_ai_gateway" });
  } catch {
    try {
      const generated = await generateWithOpenAI(system, user);
      return NextResponse.json({ ...fallback, ...generated, classifications, source: "openai" });
    } catch {
      return NextResponse.json({
        ...fallback,
        orderedTitles: videos.map((video) => video.title),
        groups: buildGroups(classifications),
        classifications,
        source: "rules"
      });
    }
  }
}

async function generateWithGateway(system: string, user: string) {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI Gateway is not configured.");

  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) throw new Error("AI Gateway request failed.");
  const data = await response.json();
  return parseModelJson(data?.choices?.[0]?.message?.content);
}

async function generateWithOpenAI(system: string, user: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI is not configured.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" }
  });

  return parseModelJson(response.choices[0]?.message.content);
}

function parseModelJson(content: unknown) {
  if (typeof content !== "string") return {};
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildGroups(classifications: Array<{ title: string; category: string; stage: string }>) {
  return classifications.reduce<Record<string, string[]>>((groups, item) => {
    const key = `${item.stage}: ${item.category}`;
    groups[key] = [...(groups[key] ?? []), item.title];
    return groups;
  }, {});
}
