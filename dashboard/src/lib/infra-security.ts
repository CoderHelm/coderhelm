// Infrastructure vulnerabilities: what a team runs on AWS (AMIs, node groups,
// databases, caches, Fargate services, Lambda functions) matched by version
// against AWS's bulletins and the Amazon Linux and Bottlerocket advisories.
// The gateway keeps the rules (coderhelm-platform, /api/security/infrastructure*);
// this file is the dashboard's half of that contract.

import type { Tone } from "@/components/list/status";
import { request } from "./api";
import { SHAPE_ERROR, type Tier } from "./security";

export type InfraKind =
  | "auto_scaling_group"
  | "ec2_instance"
  | "eks_nodegroup"
  | "eks_cluster"
  | "ecs_fargate_service"
  | "lambda_function"
  | "rds_cluster"
  | "rds_instance"
  | "elasticache_group"
  | "opensearch_domain"
  | "container_image";

export type FixKind = "pr" | "runbook" | "aws";
export type InfraStatus = "open" | "fixing" | "pr_open" | "fixed" | "aws_managed" | "dismissed";

export interface InfraLocation {
  repo: string;
  file: string;
  address: string;
  line: number;
  how: "tag" | "search" | "cloudformation" | string;
}

export interface InfraExposure {
  public: boolean;
  why: string;
}

export interface InfraSource {
  id: string;
  kind: "bulletin" | "alas" | "bottlerocket" | "runtime" | "maintenance" | "inspector" | string;
  url: string;
  severity: string;
}

export interface InfraFix {
  kind: FixKind;
  summary: string;
  location: InfraLocation | null;
  from: string;
  to: string;
  cli: string[];
  console: string;
  apply_by: string;
  reason: string;
}

export interface InfraFinding {
  id: string;
  account: string;
  region: string;
  kind: InfraKind;
  name: string;
  group: string;
  resources: string[];
  count: number;
  title: string;
  cves: string[];
  sources: InfraSource[];
  severity: string;
  kev: boolean;
  exposure: InfraExposure;
  tier: Tier | null;
  fix: InfraFix;
  status: InfraStatus;
  pr: { number: number; url: string; state: "open" | "merged" | "closed" } | null;
  inspector?: { exploit_available: boolean; reachable: boolean | null } | null;
  first_seen_at: string;
  updated_at: string;
  fixed_at?: string | null;
}

export interface InfraReadError {
  call: string;
  why: string;
  permission: string | null;
}

export interface InfraAccount {
  account: string;
  region: string;
  on: boolean;
  available: boolean | null;
  missing: string[];
  update_url: string | null;
  read: { read_at: string; resources: number; errors: InfraReadError[] } | null;
}

export interface InfraOverview {
  enabled: boolean;
  dry_run: boolean;
  counts: { open: number; p0: number; p1: number; p2: number; p3: number; prs: number; runbooks: number; aws_managed: number; fixed_30d: number };
  accounts: InfraAccount[];
  findings: InfraFinding[];
  read_at: string | null;
}

export interface InfraPending {
  kind: string;
  name: string;
  description: string;
  apply_by: string;
  auto_applied_after: string;
  status: string;
}

export interface InfraResource {
  id: string;
  kind: InfraKind;
  name: string;
  account: string;
  region: string;
  group: string;
  count: number;
  source: "aws" | "iac";
  versions: {
    ami_id?: string;
    ami_name?: string;
    ami?: { os: string; flavor: string; release: string; date: string; kernel_line: string } | null;
    kernel?: string;
    image?: string;
    image_digest?: string;
    node_release?: string;
    k8s_version?: string;
    ami_type?: string;
    launch_type?: string;
    oldest_task_started?: string;
    platform_version?: string;
    engine?: string;
    engine_version?: string;
    runtime?: string;
    package_type?: string;
  };
  exposure: InfraExposure;
  tags: Record<string, string>;
  pending: InfraPending[];
  defined_in: InfraLocation | null;
  seen_at: string;
  findings: string[];
}

export interface InfraFeed {
  feed: string;
  name: string;
  read_at: string | null;
  count: number;
  fresh: boolean;
  error: string | null;
  error_at: string | null;
}

export interface InfraInsights {
  open: number;
  by_tier: Record<Tier, number>;
  opened_30d: number;
  fixed_30d: number;
  median_days_to_fix: number | null;
  prs_opened_30d: number;
  runbooks_open: number;
  aws_managed: number;
}

// A reply missing the parts a page reads is an error the page shows, never a crash.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (): never => {
  throw new Error(SHAPE_ERROR);
};

export function checkInfraOverview(r: unknown): InfraOverview {
  if (!isObj(r) || !isObj(r.counts) || !Array.isArray(r.findings)) fail();
  const o = r as Record<string, unknown>;
  const findings = (o.findings as unknown[]).map((f) => {
    if (!isObj(f) || typeof f.id !== "string" || !isObj(f.fix) || typeof f.title !== "string") fail();
    const x = f as unknown as InfraFinding;
    return { ...x, cves: x.cves ?? [], sources: x.sources ?? [], fix: { ...x.fix, cli: x.fix.cli ?? [] } };
  });
  return {
    ...(o as unknown as InfraOverview),
    enabled: o.enabled !== false,
    dry_run: o.dry_run === true,
    accounts: Array.isArray(o.accounts) ? (o.accounts as InfraAccount[]) : [],
    findings,
    read_at: typeof o.read_at === "string" ? o.read_at : null,
  };
}

export function checkResources(r: unknown): { accounts: InfraAccount[]; resources: InfraResource[] } {
  if (!isObj(r) || !Array.isArray(r.resources)) fail();
  const o = r as Record<string, unknown>;
  return {
    accounts: Array.isArray(o.accounts) ? (o.accounts as InfraAccount[]) : [],
    resources: (o.resources as InfraResource[]).map((x) => ({ ...x, pending: x.pending ?? [], findings: x.findings ?? [], tags: x.tags ?? {}, versions: x.versions ?? {} })),
  };
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const infraApi = {
  overview: () => request<unknown>("/api/security/infrastructure").then(checkInfraOverview),
  resources: () => request<unknown>("/api/security/infrastructure/resources").then(checkResources),
  sources: () =>
    request<unknown>("/api/security/infrastructure/sources").then((r) => {
      if (!isObj(r) || !Array.isArray(r.feeds)) fail();
      return (r as { feeds: InfraFeed[] }).feeds;
    }),
  insights: () =>
    request<unknown>("/api/security/infrastructure/insights").then((r) => {
      if (!isObj(r) || typeof r.open !== "number") fail();
      return r as unknown as InfraInsights;
    }),
  check: () => request<{ status: string }>("/api/security/infrastructure/check", json("POST")),
  fix: (id: string) =>
    request<{ status: "started" | "queued" | "skipped"; reason: string | null }>(`/api/security/infrastructure/findings/${encodeURIComponent(id)}/fix`, json("POST")),
};

// ── Words ───────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<InfraKind, string> = {
  auto_scaling_group: "Auto Scaling group",
  ec2_instance: "EC2 instance",
  eks_nodegroup: "EKS node group",
  eks_cluster: "EKS cluster",
  ecs_fargate_service: "ECS service on Fargate",
  lambda_function: "Lambda function",
  rds_cluster: "Aurora cluster",
  rds_instance: "RDS instance",
  elasticache_group: "ElastiCache cluster",
  opensearch_domain: "OpenSearch domain",
  container_image: "Container image",
};

/** What a row covers: "3 instances", "4 nodes", "1 task". */
export function countWords(kind: InfraKind, n: number): string {
  const unit =
    kind === "auto_scaling_group" || kind === "ec2_instance"
      ? "instance"
      : kind === "eks_nodegroup"
        ? "node"
        : kind === "ecs_fargate_service"
          ? "task"
          : kind === "rds_cluster"
            ? "database instance"
            : kind === "lambda_function"
              ? "function"
              : "resource";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export const FIX_LOOK: Record<FixKind, { label: string; tone: Tone; hover: string }> = {
  pr: { label: "Fix PR", tone: "info", hover: "A pull request in the code that defines it." },
  runbook: { label: "Runbook", tone: "attention", hover: "A step to apply in AWS. Coderhelm shows it; it never runs it." },
  aws: { label: "AWS-managed", tone: "muted", hover: "AWS patches it. Nothing to do." },
};

export const INFRA_STATUS_LOOK: Record<InfraStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "attention" },
  fixing: { label: "Fix run started", tone: "live" },
  pr_open: { label: "PR open", tone: "info" },
  fixed: { label: "Fixed", tone: "success" },
  aws_managed: { label: "AWS-managed", tone: "muted" },
  dismissed: { label: "Dismissed", tone: "muted" },
};

/** A GitHub link to where the resource is defined, when the location names a file. */
export function locationHref(l: InfraLocation | null | undefined): string | null {
  if (!l || !l.repo || !l.file) return null;
  return `https://github.com/${l.repo}/blob/HEAD/${l.file.replace(/^\/+/, "")}${l.line ? `#L${l.line}` : ""}`;
}

/** "acme/infra · envs/prod/main.tf:3 · aws_launch_template.web" */
export function locationWords(l: InfraLocation | null | undefined): string | null {
  if (!l) return null;
  if (!l.repo && !l.file) return l.address || null;
  return [l.repo, l.file ? `${l.file}${l.line ? `:${l.line}` : ""}` : "", l.address].filter(Boolean).join(" · ");
}

/** The resource's main version in one phrase: "AMI 2023.12.20261020", "aurora-postgresql 16.4". */
export function versionWords(r: InfraResource): string {
  const v = r.versions;
  if (v.ami?.release) return `${v.ami.flavor === "eks" ? "EKS AMI" : v.ami.flavor === "bottlerocket" ? "Bottlerocket" : "AMI"} ${v.ami.release}`;
  if (v.node_release) return `release ${v.node_release}`;
  if (v.engine) return `${v.engine} ${v.engine_version ?? ""}`.trim();
  if (v.runtime) return `${v.runtime}${v.package_type && v.package_type !== "Zip" ? ` (${v.package_type})` : ""}`;
  if (v.launch_type) return `${v.launch_type === "FARGATE" ? "Fargate" : v.launch_type}${v.platform_version ? ` ${v.platform_version}` : ""}`;
  if (v.image) return v.image;
  if (v.k8s_version) return `Kubernetes ${v.k8s_version}`;
  return "";
}

/** The Security page's link to one finding. */
export function findingHref(id: string): string {
  return `/security/infrastructure?finding=${encodeURIComponent(id)}`;
}
