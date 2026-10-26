// Webhooks (Settings, Webhooks): the endpoints Coderhelm sends the team's
// events to, their signing secrets, and their deliveries. The rules (signing,
// retries, address checks, turning failing endpoints off) live in the
// gateway (services/gateway/src/routes/webhooks.rs and common::webhooks).

import { apiBase } from "@/lib/runtime-config";

/** Where outbound webhooks are documented. */
export const WEBHOOK_DOCS_URL = "https://docs.coderhelm.com/api/webhooks/";

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string;
  /** Event types; `["*"]` is every event. */
  events: string[];
  enabled: boolean;
  /** "manual", "failing", or "" while on. */
  disabled_reason: string;
  secret_hint: string;
  previous_secret_expires_at?: string | null;
  failing_since?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface WebhookEndpointList {
  endpoints: WebhookEndpoint[];
  max: number;
  disable_after_days: number;
  retention_days: number;
}

export interface WebhookEventType {
  type: string;
  group: string;
  summary: string;
  description: string;
  subscribable: boolean;
  example: unknown;
}

export interface WebhookEventTypes {
  api_version: string;
  event_types: WebhookEventType[];
}

export interface WebhookAttempt {
  at: string;
  code?: number | null;
  duration_ms: number;
  error?: string;
}

export interface WebhookDelivery {
  id: string;
  event_id: string;
  event: string;
  status: "pending" | "handled" | "failed" | "received" | "ignored";
  outcome: string;
  reason: string;
  reason_message: string;
  reason_fix: string;
  attempts: WebhookAttempt[];
  next_retry_at: string | null;
  created_at: string;
  payload_preview?: string;
  headers?: Record<string, string>;
}

export interface EndpointInput {
  url?: string;
  description?: string;
  events?: string[];
  enabled?: boolean;
}

export interface ReplayResult {
  queued: number;
  found: number;
  capped: boolean;
}

/** A refused request, with the form field the gateway named, if any. */
export class WebhookError extends Error {
  constructor(
    message: string,
    public status: number,
    public field?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const msg = typeof body.error === "string" && body.error ? body.error : `The request failed (${res.status}).`;
    throw new WebhookError(msg, res.status, typeof body.field === "string" ? body.field : undefined);
  }
  return body as T;
}

const ep = (id: string) => `/api/webhooks/endpoints/${encodeURIComponent(id)}`;
const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body) });

export const webhooksApi = {
  eventTypes: () => request<WebhookEventTypes>("/api/webhooks/event-types"),
  list: () => request<WebhookEndpointList>("/api/webhooks/endpoints"),
  create: (body: EndpointInput) =>
    request<{ endpoint: WebhookEndpoint; secret: string }>("/api/webhooks/endpoints", post(body)),
  get: (id: string) => request<WebhookEndpoint>(ep(id)),
  update: (id: string, body: EndpointInput) => request<WebhookEndpoint>(ep(id), { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => request<{ deleted: boolean }>(ep(id), { method: "DELETE" }),
  reveal: (id: string) => request<{ secret: string; previous_secret_expires_at: string | null }>(`${ep(id)}/secret`),
  rotate: (id: string, overlapHours: number) =>
    request<{ secret: string; previous_secret_expires_at: string | null }>(`${ep(id)}/secret/rotate`, post({ overlap_hours: overlapHours })),
  test: (id: string) => request<WebhookDelivery>(`${ep(id)}/test`, post()),
  deliveries: (id: string, status = "all", limit = 25) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (status !== "all") q.set("status", status);
    return request<{ deliveries: WebhookDelivery[] }>(`${ep(id)}/deliveries?${q}`);
  },
  resend: (id: string, deliveryId: string) =>
    request<WebhookDelivery>(`${ep(id)}/deliveries/${encodeURIComponent(deliveryId)}/resend`, post()),
  replay: (id: string, body: { since: string; until?: string; only_failed: boolean }) =>
    request<ReplayResult>(`${ep(id)}/replay`, post(body)),
};

/** "All events", or the count and the first few, for a list row. */
export function eventsSummary(events: string[]): string {
  if (events.includes("*")) return "All events";
  if (events.length <= 3) return events.join(", ");
  return `${events.slice(0, 3).join(", ")} and ${events.length - 3} more`;
}

/** Event types grouped as the catalog groups them, test event left out. */
export function groupEvents(types: WebhookEventType[]): { group: string; types: WebhookEventType[] }[] {
  const out: { group: string; types: WebhookEventType[] }[] = [];
  for (const t of types.filter((t) => t.subscribable)) {
    const g = out.find((x) => x.group === t.group);
    if (g) g.types.push(t);
    else out.push({ group: t.group, types: [t] });
  }
  return out;
}

/** The settings page of one endpoint. */
export const endpointHref = (id: string) => `/settings/webhooks/?endpoint=${encodeURIComponent(id)}`;
