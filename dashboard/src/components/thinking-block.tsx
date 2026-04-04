"use client";

import { useState } from "react";
import { BrainIcon, ChevronDownIcon } from "./stream-icons";

interface ThinkingBlockProps {
  content: string;
  streaming?: boolean;
}

export function ThinkingBlock({ content, streaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content && !streaming) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer"
      >
        <BrainIcon />
        <span>{streaming ? "Thinking..." : "Thought process"}</span>
        {streaming && (
          <span className="flex gap-0.5 ml-1">
            <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
        {!streaming && (
          <ChevronDownIcon
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {(expanded || streaming) && content && (
        <div className="mt-1.5 pl-5 border-l border-zinc-800 text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}
