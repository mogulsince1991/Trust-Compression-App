import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(request: Request) {
  const { title, transcript, notes } = await request.json();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      summary: "OpenAI is not configured yet.",
      tags: ["Needs API key"],
      suggestedUse: "Add OPENAI_API_KEY in Vercel to enable AI analysis."
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Analyze sales-support videos for a Trust Compression app. Return concise JSON only with summary, tags, objections, proofType, buyingStage, and suggestedUse."
      },
      {
        role: "user",
        content: JSON.stringify({ title, transcript, notes })
      }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message.content ?? "{}";
  return NextResponse.json(JSON.parse(content));
}
