"use client";

import { useEffect, useId, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export default function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          themeVariables: {
            primaryColor: "#111111",
            primaryTextColor: "#d1d5db",
            lineColor: "#14b8a6",
            tertiaryColor: "#0d1117",
          },
        });

        const result = await mermaid.render(`landing-${id}`, chart);
        if (!mounted) return;
        setSvg(result.svg);
        setError("");
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to render diagram");
      }
    }

    render();

    return () => {
      mounted = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className={className}>
        <p className="text-xs text-red-400">Failed to render diagram: {error}</p>
      </div>
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Rendered Mermaid architecture diagram"
    />
  );
}
