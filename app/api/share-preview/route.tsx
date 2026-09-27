import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET(request: Request) {
  const title = new URL(request.url).searchParams.get("title")?.slice(0, 140) || "Explore our work";
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: "#eff1f3", color: "#272727" }}>
      <div style={{ display: "flex", fontSize: 28, color: "#426b50" }}>Shared with you</div>
      <div style={{ display: "flex", fontSize: 62, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}><span>Explore the collection</span><span>TrustTale</span></div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
