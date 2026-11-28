import type { ShotId } from "@/content/types";
import { SHOTS } from "@/content/shots";

// A light screenshot of the dashboard for the home page: AVIF, then WebP, at
// two widths each, with the PNG as the fallback. The width and height keep
// its space while it loads. The first picture on the page loads at once; the
// rest wait until they are near the screen.
export function ProductShot({ id, sizes, priority = false, className = "" }: { id: ShotId; sizes: string; priority?: boolean; className?: string }) {
  const s = SHOTS[id];
  const img = s.desktop;
  const base = img.src.replace(/\.png$/, "");
  const set = (ext: string) => `${base}-1280.${ext} 1280w, ${base}-2400.${ext} ${s.large ?? 2400}w`;
  // Phones get a crop without the dashboard's menu, so the words stay readable.
  const phoneBase = s.phone?.src.replace(/\.png$/, "");
  const phoneSet = (ext: string) => `${phoneBase}-1280.${ext} 1280w`;
  return (
    <picture className={className}>
      {s.phone && (
        <>
          <source media="(max-width: 639px)" type="image/avif" srcSet={phoneSet("avif")} sizes={sizes} />
          <source media="(max-width: 639px)" type="image/webp" srcSet={phoneSet("webp")} sizes={sizes} />
        </>
      )}
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
      <img
        src={img.src}
        width={img.width}
        height={img.height}
        alt={s.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="block h-auto w-full"
      />
    </picture>
  );
}
