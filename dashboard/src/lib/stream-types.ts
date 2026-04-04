// ---------------------------------------------------------------------------
// Streaming chat types — multi-part message model + SSE event types
// ---------------------------------------------------------------------------

/** Status state machine for the chat UI */
export type StreamStatus = "idle" | "submitted" | "streaming" | "ready" | "error";

// -- SSE event types (wire format from backend) -----------------------------

export type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; id: string; name: string; server?: string }
  | { type: "tool_input_delta"; id: string; partial_json: string }
  | { type: "tool_result"; id: string; status: "success" | "error"; summary: string }
  | { type: "usage"; input_tokens: number; output_tokens: number; turns: number }
  | { type: "done" }
  | { type: "error"; message: string };

// -- Multi-part message model -----------------------------------------------

export interface TextPart {
  type: "text";
  content: string;
}

export interface ThinkingPart {
  type: "thinking";
  content: string;
  collapsed?: boolean;
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  server?: string;
  input: string;
  status: "running" | "success" | "error";
  summary?: string;
}

export interface UsagePart {
  type: "usage";
  input_tokens: number;
  output_tokens: number;
  turns: number;
}

export type MessagePart = TextPart | ThinkingPart | ToolCallPart | UsagePart;

export interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  streaming?: boolean;
}

// -- Legacy compat (for session persistence) --------------------------------

export interface LegacyMessage {
  role: "user" | "assistant";
  content: string;
  mcp_servers?: string[];
}
