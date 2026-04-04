// Blinking cursor shown at the end of streaming text
export function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1.1em] bg-zinc-400 align-text-bottom ml-0.5 animate-cursor-blink" />
  );
}
