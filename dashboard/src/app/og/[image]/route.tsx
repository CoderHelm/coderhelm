// The link preview pictures (lib/link-preview.ts): one 1200x630 PNG per
// top-level page, made at build time into out/og/<section>.png and served
// from the dashboard's own origin. Each shows the mark, the section's name
// and its one line from lib/routes.ts; nothing from any team's data.

import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { imageSections, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME } from "@/lib/link-preview";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return imageSections().map((s) => ({ image: `${s.slug}.png` }));
}

// DejaVu Sans (already a dev dependency for the end-to-end tests): satori
// reads WOFF, not WOFF2.
function font(weight: 400 | 700): Buffer {
  return fs.readFileSync(
    path.join(process.cwd(), "node_modules", "@fontsource", "dejavu-sans", "files", `dejavu-sans-latin-${weight}-normal.woff`),
  );
}

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#000000" />
      <polygon points="6.5,26 9.75,26 14,6 10.75,6" fill="#ffffff" />
      <polygon points="12.25,26 15.5,26 19.75,6 16.5,6" fill="#ffffff" />
      <polygon points="18,26 21.25,26 25.5,6 22.25,6" fill="#ffffff" />
    </svg>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ image: string }> }) {
  const { image } = await params;
  const section = imageSections().find((s) => `${s.slug}.png` === image);
  if (!section) return new Response("Not found", { status: 404 });
  const long = section.name.length > 18;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "88px 92px 80px",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 18% 0%, rgba(59,130,246,0.16), rgba(10,10,10,0) 55%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 48px 48px, 48px 48px",
          color: "#fafafa",
          fontFamily: "DejaVu Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", borderRadius: 12, border: "1px solid #27272a" }}>
            <Mark size={56} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ fontSize: long ? 80 : 104, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>{section.name}</div>
          <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.4, color: "#a1a1aa", maxWidth: 980 }}>{section.description}</div>
        </div>
      </div>
    ),
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      fonts: [
        { name: "DejaVu Sans", data: font(400), weight: 400, style: "normal" },
        { name: "DejaVu Sans", data: font(700), weight: 700, style: "normal" },
      ],
    },
  );
}
