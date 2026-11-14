import { ImageResponse } from "next/og";
import { getPost } from "@/lib/blog";

export const alt = "SEO STUDIO blog article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  const title = post?.title ?? "SEO STUDIO Blog";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f3efea", padding: "72px 80px", color: "#171310" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 4, color: "#c14f0b" }}>SEO STUDIO · BLOG</div>
        <div style={{ display: "flex", fontSize: title.length > 60 ? 60 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", height: 8, width: 160, background: "#e96306" }} />
      </div>
    ),
    size,
  );
}
