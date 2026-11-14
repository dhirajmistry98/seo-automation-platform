import { ImageResponse } from "next/og";

export const alt = "SEO STUDIO — SEO Automation Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f3efea", padding: "72px 80px", color: "#171310" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 4, color: "#c14f0b" }}>SEO STUDIO</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>SEO automation for growing websites</div>
          <div style={{ fontSize: 32, color: "#625a53" }}>Audits · PageSpeed · Search Console · AI search readiness</div>
        </div>
        <div style={{ display: "flex", height: 8, width: 160, background: "#e96306" }} />
      </div>
    ),
    size,
  );
}
