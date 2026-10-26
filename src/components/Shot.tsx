import type { ShotId } from "@/content/types";
import { SHOTS } from "@/content/shots";

// A screenshot of the real dashboard. Phones get the phone layout of the same
// page, so the text in the picture stays readable.
export function Shot({ id, caption }: { id: ShotId; caption: string }) {
  const s = SHOTS[id];
  return (
    <figure className="mx-auto w-full min-w-0 max-w-4xl">
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_80px_-30px_rgba(59,130,246,0.25)]">
        <picture>
          {s.phone && <source media="(max-width: 639px)" srcSet={s.phone.src} width={s.phone.width} height={s.phone.height} />}
          <img src={s.desktop.src} width={s.desktop.width} height={s.desktop.height} alt={s.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
        </picture>
      </div>
      <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-text-muted">{caption}</figcaption>
    </figure>
  );
}
