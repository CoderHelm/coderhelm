"use client";

import { useState } from "react";
import type { ToolCallPart } from "@/lib/stream-types";
import {
  LoaderIcon,
  CheckIcon,
  XIcon,
  ChevronDownIcon,
  getToolIcon,
} from "./stream-icons";

interface ToolCallCardProps {
  tool: ToolCallPart;
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(tool.name);

  // Format tool name: "server__tool_name" → "tool name" with server badge
  const displayName = tool.name.includes("__")
    ? tool.name.split("__").pop()!.replace(/_/g, " ")
    : tool.name.replace(/_/g, " ");

  const serverName = tool.server || (tool.name.includes("__") ? tool.name.split("__")[0] : undefined);

  return (
    <div className="my-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors text-xs cursor-pointer group"
      >
        {/* Status indicator */}
        {tool.status === "running" ? (
          <LoaderIcon className="animate-spin text-zinc-500 flex-shrink-0" />
        ) : tool.status === "success" ? (
          <span className="text-zinc-500 flex-shrink-0"><CheckIcon /></span>
        ) : (
          <span className="text-zinc-500 flex-shrink-0"><XIcon /></span>
        )}

        {/* Tool icon + name */}
        <span className="text-zinc-500 flex-shrink-0"><Icon /></span>
        <span className="text-zinc-400 font-medium truncate">{displayName}</span>

        {/* Server badge */}
        {serverName && (
          <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-500 text-[10px] font-medium flex-shrink-0">
            {serverName}
          </span>
        )}

        {/* Summary (when collapsed and done) */}
        {!expanded && tool.summary && tool.status !== "running" && (
          <span className="text-zinc-600 truncate ml-auto">{tool.summary}</span>
        )}

        {/* Expand chevron */}
        {(tool.input || tool.summary) && (
          <ChevronDownIcon
            className={`ml-auto text-zinc-600 transition-transform duration-200 flex-shrink-0 opacity-0 group-hover:opacity-100 ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {expanded && (tool.input || tool.summary) && (
        <div className="mt-1 ml-5 pl-2.5 border-l border-zinc-800 text-xs space-y-1.5">
          {tool.input && (
            <div>
              <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Input</span>
              <pre className="text-zinc-500 font-mono whitespace-pre-wrap break-all mt-0.5 max-h-32 overflow-y-auto">
                {formatToolInput(tool.input)}
              </pre>
            </div>
          )}
          {tool.summary && (
            <div>
              <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Result</span>
              <p className="text-zinc-400 mt-0.5">{tool.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatToolInput(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}
