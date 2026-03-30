"use client";

import { useEffect, useId, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

let iconPackRegistered = false;

export default function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!iconPackRegistered) {
          mermaid.registerIconPacks([
            {
              name: "logos",
              loader: () => import("@iconify-json/logos").then((module) => module.icons),
            },
          ]);
          iconPackRegistered = true;
        }

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
          architecture: {
            padding: 16,
            iconSize: 32,
            fontSize: 11,
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
      className={`mermaid-diagram ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Rendered Mermaid architecture diagram"
      style={{
        // tame architecture-beta defaults: shrink fonts and spacing
        // @ts-expect-error CSS custom properties
        "--mermaid-font-size": "11px",
      }}
    />
  );
}
