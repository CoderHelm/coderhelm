import { apiBase } from "@/lib/runtime-config";
import type {
  AgentEvent, AgentKey, Approval, ApprovalCan, Choice, PolicyView, Preset, Rule, TestResult, Via,
} from "@/lib/agent-policy";

/**
 * Words for a failed request when the server sent no message of its own (the
 * gateway often answers with a bare status). Pages used to show
 * "API 500: Internal Server Error". The code stays in the text, because some
 * pages pick their own message by it ("403", "409").
 */
export function httpErrorMessage(status: number): string {
  if (status === 401) return "You are signed out. Sign in again (error 401).";
  if (status === 403) return "Your role does not allow this. Ask an admin on your team (error 403).";
  if (status === 404) return "Not found. It may have been deleted (error 404).";
  if (status === 409) return "That conflicts with the current state. Refresh and try again (error 409).";
  if (status === 429) return "Too many requests, or the token limit is reached. Wait a moment and try again (error 429).";
  if (status >= 500) return `The server had a problem. Try again in a moment (error ${status}).`;
  return `The request was not accepted (error ${status}).`;
}

/** A failed request, with its HTTP status for pages that branch on it. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The HTTP status of a failed request, if `e` is one. */
export function errorStatus(e: unknown): number | undefined {
  return e instanceof ApiError ? e.status : undefined;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let serverMsg = "";
    let serverCode: string | undefined;
    try {
      const parsed = body ? JSON.parse(body) : {};
      serverMsg = parsed.error || "";
      serverCode = typeof parsed.code === "string" ? parsed.code : undefined;
    } catch {}
    throw new ApiError(serverMsg || httpErrorMessage(res.status), res.status, serverCode);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

/**
 * Like `request`, but a non-2xx response with a JSON body is returned instead of
 * thrown. Used where the failure body carries detail the screen must show next
 * to its cause (the named checks of a data source), not just a message.
 */
async function requestWithBody<T, E>(
  path: string,
  options?: RequestInit,
): Promise<({ ok: true } & T) | ({ ok: false; error: string } & Partial<E>)> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const error = typeof body.error === "string" && body.error ? body.error : httpErrorMessage(res.status);
    return { ...(body as Partial<E>), ok: false, error };
  }
  return { ...(body as T), ok: true };
}

/** A person's own two-factor sign-in (self-hosted installs). */
export interface MyTwoFactor {
  self_hosted: boolean;
  /** The organization requires it. */
  required: boolean;
  /** This session can only set it up until it has a second factor. */
  held: boolean;
  session_has_2fa?: boolean;
  signed_in_with?: "password" | "google" | "github";
  /** What they have set up: Cognito's codes (password sign-in) or Coderhelm's (Google, GitHub). */
  set_up?: "cognito" | "app" | null;
  /** The kind that fits how they signed in. */
  fits?: "cognito" | "app";
}

/** Settings, Sign-in (self-hosted installs). */
export interface SignInSettings {
  self_hosted: boolean;
  is_org?: boolean;
  domains?: string[];
  require_2fa?: boolean;
  require_2fa_since?: string | null;
  pending_invites?: number;
  people?: {
    user_id: string;
    email: string;
    name: string;
    github_login: string;
    role: string;
    two_factor: "cognito" | "app" | null;
    is_self: boolean;
  }[];
  api_keys?: { id: string; name: string; created_by: string }[];
  your_session_has_2fa?: boolean;
}

export const api = {
  // Auth
  me: () =>
    request<{
      user_id: string;
      team_id: string;
      github_login: string | null;
      email: string;
      avatar_url: string;
      role: string;
      status?: string;
      auth_provider?: string;
      mfa_enabled?: boolean;
      /** Set in a read-only support view. */
      support_view?: { team_id: string; until: number } | null;
      /** The capability keys this person holds (lib/capabilities.ts). */
      capabilities?: string[];
      /** Set when their role is one of the team's custom roles. */
      custom_role?: { id: string; name: string } | null;
      /** The team's switches; `plugins` turns plugins on. */
      flags?: { plugins?: boolean };
      /** An admin of the whole install (the server's PLATFORM_ADMIN_EMAILS). */
      platform_admin?: boolean;
    }>("/api/me"),
  signup: (email: string, password: string) =>
    request<{ status: string; message: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  joinWaitlist: (email: string, extra: { company?: string; reason?: string } = {}) =>
    request<{ status: string; message: string }>("/auth/waitlist", {
      method: "POST",
      body: JSON.stringify({ email, ...extra }),
    }),
  loginEmail: (email: string, password: string) =>
    request<{ status: string; session?: string; team_id?: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),
  verifyEmail: (email: string, code: string) =>
    request<{ status: string; message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  forgotPassword: (email: string) =>
    request<{ status: string; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  confirmReset: (email: string, code: string, new_password: string) =>
    request<{ status: string; message: string }>("/auth/confirm-reset", {
      method: "POST",
      body: JSON.stringify({ email, code, new_password }),
    }),
  mfaVerify: (session: string, code: string, email: string) =>
    request<{ status: string; team_id?: string }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ session, code, email }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // Allowlist
  /** Every team with its runs, cost and members. Platform admin only (403 otherwise). */
  adminTeams: () => request<AdminTeamsReply>("/api/admin/teams"),
  /** Everyone on the beta waitlist and where they stand. Platform admin only. */
  adminBetaSignups: () => request<BetaSignupsReply>("/api/admin/beta-signups"),
  /** Marks a sign-up invited and adds the email to the sign-up allowlist. No email is sent. */
  inviteBetaSignup: (email: string) =>
    request<{ status: string; email: string; invited_at: string }>("/api/admin/beta-signups/invite", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  // Support tickets: the team's own, and the platform admin's queue (403 for anyone else)
  supportTickets: () => request<{ tickets: SupportTicket[] }>("/api/support/tickets"),
  supportTicket: (id: string) => request<SupportDetail>(`/api/support/tickets/${encodeURIComponent(id)}`),
  openSupportTicket: (body: NewSupportTicket) =>
    request<SupportDetail>("/api/support/tickets", { method: "POST", body: JSON.stringify(body) }),
  replySupportTicket: (id: string, body: string, items: SupportItemRef[] = []) =>
    request<SupportDetail>(`/api/support/tickets/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify({ body, items }),
    }),
  /** The filer or a team admin marks the ticket resolved. */
  resolveSupportTicket: (id: string) =>
    request<SupportDetail>(`/api/support/tickets/${encodeURIComponent(id)}/resolve`, { method: "POST", body: "{}" }),
  /** Adds a team member (`user_id`) or copies an address (`email`). Adding yourself is following. */
  addSupportPerson: (id: string, who: SupportPersonRef, admin = false) =>
    request<SupportDetail>(`/api/${admin ? "admin/" : ""}support/tickets/${encodeURIComponent(id)}/participants`, {
      method: "POST",
      body: JSON.stringify(who),
    }),
  /** Takes someone off the ticket. Taking yourself off is unfollowing. */
  removeSupportPerson: (id: string, who: SupportPersonRef, admin = false) =>
    request<SupportDetail>(`/api/${admin ? "admin/" : ""}support/tickets/${encodeURIComponent(id)}/participants/remove`, {
      method: "POST",
      body: JSON.stringify(who),
    }),
  supportBadge: () => request<{ waiting: number; queue_open: number | null }>("/api/support/badge"),
  adminSupportTickets: () =>
    request<{ tickets: SupportTicket[]; support_access?: Record<string, string> }>("/api/admin/support/tickets"),
  adminSupportTicket: (id: string) => request<SupportDetail>(`/api/admin/support/tickets/${encodeURIComponent(id)}`),
  // Support access: the team lets Coderhelm support see its workspace for a while.
  supportAccess: () => request<SupportAccess>("/api/support/access"),
  grantSupportAccess: (body: { hours: number; note?: string; ticket_id?: string }) =>
    request<{ grant: SupportGrant }>("/api/support/access", { method: "POST", body: JSON.stringify(body) }),
  revokeSupportAccess: () => request<{ grant: SupportGrant | null }>("/api/support/access", { method: "DELETE" }),
  /** Platform admins: open a read-only support view of a team that allowed it. */
  startSupportView: (team_id: string, ticket_id?: string) =>
    request<{ team_id: string; team_name: string; until: string; grant_until: string }>("/api/admin/support/view", {
      method: "POST",
      body: JSON.stringify({ team_id, ticket_id }),
    }),
  supportViewStatus: () => request<SupportViewStatus>("/api/support/view"),
  exitSupportView: () => request<{ active: false }>("/api/support/view", { method: "DELETE" }),
  adminReplySupportTicket: (id: string, body: string, status?: SupportStatus) =>
    request<SupportDetail>(`/api/admin/support/tickets/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify({ body, status }),
    }),
  adminSetSupportTicket: (id: string, change: { status?: SupportStatus; priority?: SupportPriority }) =>
    request<SupportDetail>(`/api/admin/support/tickets/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: JSON.stringify(change),
    }),
  listAllowlist: () => request<{ emails: string[] }>("/api/allowlist"),
  addToAllowlist: (email: string) =>
    request<{ status: string; email: string }>("/api/allowlist", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  removeFromAllowlist: (email: string) =>
    request<{ status: string }>("/api/allowlist", {
      method: "DELETE",
      body: JSON.stringify({ email }),
    }),

  // Health
  getHealth: () => request<HealthCheck>("/api/health"),

  // Failed messages (the team's part of the shared DLQ). Redrive and delete
  // name the message by id; the gateway reads it back and checks the team.
  getDlqMessages: () => request<DlqList>("/api/dlq"),
  redriveDlqMessage: (message_id: string) =>
    request<void>("/api/dlq/redrive", {
      method: "POST",
      body: JSON.stringify({ message_id }),
    }),
  deleteDlqMessage: (message_id: string) =>
    request<void>("/api/dlq/delete", {
      method: "POST",
      body: JSON.stringify({ message_id }),
    }),
  purgeDlq: () => request<void>("/api/dlq/purge", { method: "POST" }),
  /** The whole shared DLQ, every team's and the global jobs'. Platform admin only. */
  adminDlq: () => request<AdminDlqList>("/api/admin/dlq"),
  /** The daily check of recorded model usage against Anthropic's report. Platform admin only. */
  adminUsageCheck: () => request<UsageCheck>("/api/admin/usage-check"),
  adminDlqDelete: (message_id: string) =>
    request<void>("/api/admin/dlq/delete", {
      method: "POST",
      body: JSON.stringify({ message_id }),
    }),

  // Banners
  getBanners: () => request<{ banners: Banner[] }>("/api/banners"),

  // Account
  resetAccount: () => request<void>("/api/account/reset", { method: "POST" }),
  listTeams: () => request<{ teams: TeamInfo[] }>("/api/teams"),
  switchTeam: (teamId: string) =>
    request<{ team_id: string }>("/api/teams/switch", {
      method: "POST",
      body: JSON.stringify({ team_id: teamId }),
    }),
  renameTeam: (name: string) =>
    request<{ status: string; name: string }>("/api/teams/rename", {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  // Runs
  /**
   * One page of runs, newest first. `q` searches ticket key or number, title,
   * repo, PR number and status; `status` is comma-separated exact statuses;
   * `repo` keeps one repo (older backends ignore it).
   * The server reads a bounded number of runs per call, so a filtered page
   * can be short or empty while `next` is still set.
   */
  listRuns: (cursor?: string, filters: { q?: string; status?: string; repo?: string } = {}) =>
    request<{ runs: Run[]; next?: string | null }>(
      `/api/runs${qs({ cursor, q: filters.q, status: filters.status, repo: filters.repo })}`,
    ),
  /**
   * The command palette's search: a few runs, reviewed PRs, releases and plans
   * matching every word of `q`, for the signed-in team. `types` limits the
   * families (comma-separated). Older backends answer 404.
   */
  search: (q: string, opts: { limit?: number; types?: string } = {}, init?: RequestInit) =>
    request<SearchResults>(`/api/search${qs({ q, limit: opts.limit, types: opts.types })}`, init),
  listJiraEvents: () =>
    request<{ events: JiraEvent[]; total: number }>(
      "/api/integrations/jira/events?limit=20",
    ),
  getRun: (id: string) => request<RunDetail>(`/api/runs/${id}`),
  getRunOpenspec: (id: string) => request<Openspec>(`/api/runs/${id}/openspec`),
  getAgentLog: (id: string) =>
    request<{
      passes: AgentLogPass[];
      live_events: {
        tool: string;
        input_summary: string;
        duration_ms: number;
        is_error: boolean;
        timestamp: string;
      }[];
    }>(`/api/runs/${id}/agent-log`),
  retryRun: (id: string) =>
    request<{ status: string }>(`/api/runs/${id}/retry`, { method: "POST" }),
  resetRun: (id: string) =>
    request<{ status: string }>(`/api/runs/${id}/reset`, { method: "POST" }),
  reReviewRun: (id: string) =>
    request<{ status: string }>(`/api/runs/${id}/re-review`, {
      method: "POST",
    }),
  cancelRun: (id: string) =>
    request<{ status: string }>(`/api/runs/${id}/cancel`, { method: "POST" }),
  /**
   * Close a run on purpose. Closing a closed run again is fine; a run that is
   * over already comes back `ok: false` with the reason in `message`.
   */
  closeRun: (id: string, body: CloseRunRequest) =>
    requestWithBody<CloseResult, CloseResult>(`/api/runs/${encodeURIComponent(id)}/close`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Close up to 100 runs; one result per run, in the order sent. */
  closeRuns: (ids: string[], body: CloseRunRequest) =>
    request<BulkCloseAnswer>("/api/runs/close", { method: "POST", body: JSON.stringify({ run_ids: ids, ...body }) }),
  /** Undo a close: the run shows as before (or waiting on a person); nothing restarts. */
  reopenRun: (id: string) =>
    requestWithBody<{ status: string; message?: string }, { status?: string; message?: string }>(
      `/api/runs/${encodeURIComponent(id)}/reopen`,
      { method: "POST" },
    ),
  getRunTraces: (id: string) =>
    request<{ traces: PassTrace[] }>(`/api/runs/${id}/traces`),

  // Repos
  listRepos: () => request<{ repos: Repo[] }>("/api/repos"),
  syncRepos: () =>
    request<{ total: number; added: number }>("/api/repos/sync", {
      method: "POST",
    }),
  toggleRepo: (repo: string, enabled: boolean) =>
    request<void>(`/api/repos/${repo}`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  setRepoRole: (repo: string, role: string) =>
    request<void>(`/api/repos/${repo}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  deleteRepo: (repo: string) =>
    request<void>(`/api/repos/${repo}`, { method: "DELETE" }),

  // Stats
  getStats: () => request<{ month: Stats; all_time: Stats }>("/api/stats"),
  getStatsHistory: () =>
    request<{ months: MonthStats[] }>("/api/stats/history"),
  /** The analytics page: one period (7, 30 or 90 days, or this month so far) and the one before it. */
  getAnalytics: (period: AnalyticsPeriod, repo?: string) =>
    request<Analytics>(
      `/api/analytics?${period === "mtd" ? "period=mtd" : `days=${period}`}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`,
    ),

  // Learning: what Coderhelm learned from outcomes and what it changed because of them.
  /** The Learning page: rewards, finding categories, behavior changes, exemplars and variants. */
  getLearning: (days: number, repo?: string) =>
    request<Learning>(`/api/learning?days=${days}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`),
  /** Pin one variant for an agent (admin), or `null` to let results choose again. */
  pinVariant: (agent: string, arm: string | null) =>
    request<{ ok: boolean }>("/api/learning/pin", { method: "POST", body: JSON.stringify({ agent, arm }) }),
  /** Turn one behavior change off (admin). */
  revertChange: (id: string) =>
    request<{ reverted: number }>("/api/learning/revert", { method: "POST", body: JSON.stringify({ id }) }),
  /** Turn every active behavior change off for one repository (admin). */
  revertRepo: (repo: string) =>
    request<{ reverted: number }>("/api/learning/revert", { method: "POST", body: JSON.stringify({ repo }) }),
  /** Turn a reverted change back on (admin). */
  restoreChange: (id: string) =>
    request<{ ok: boolean }>("/api/learning/restore", { method: "POST", body: JSON.stringify({ id }) }),
  /** The team's signal weights (admin); `{}` goes back to the defaults. */
  putRewardWeights: (weights: Record<string, number>) =>
    request<{ weights: Record<string, number> }>("/api/learning/weights", { method: "PUT", body: JSON.stringify({ weights }) }),

  // GitHub App installation
  getInstallationStatus: () =>
    request<{ status: string; github_org?: string; installation_id?: number }>(
      "/api/github/installation-status",
    ),
  linkGithubInstallation: (installation_id: number) =>
    request<{
      status?: string;
      error?: string;
      github_org?: string;
      installation_id?: number;
      repos_synced?: number;
      /** `github_auth_required`: the installation isn't linked yet. Only a
       * GitHub sign-in at `auth_url` links it, once GitHub confirms the
       * person can access it. */
      code?: string;
      auth_url?: string;
    }>("/api/github/link-installation", {
      method: "POST",
      body: JSON.stringify({ installation_id }),
    }),

  // Rules (guardrails)
  getGlobalRules: () => request<{ rules: string[] }>("/api/rules/global"),
  updateGlobalRules: (rules: string[]) =>
    request<void>("/api/rules/global", {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }),
  getRepoRules: (repo: string) =>
    request<{ rules: string[] }>(`/api/rules/repo/${repo}`),
  updateRepoRules: (repo: string, rules: string[]) =>
    request<void>(`/api/rules/repo/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }),

  // Voice
  getGlobalVoice: () => request<{ content: string }>("/api/voice/global"),
  updateGlobalVoice: (content: string) =>
    request<void>("/api/voice/global", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getRepoVoice: (repo: string) =>
    request<{ content: string }>(`/api/voice/repo/${repo}`),
  updateRepoVoice: (repo: string, content: string) =>
    request<void>(`/api/voice/repo/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  // Agents
  getGlobalAgents: () => request<{ content: string }>("/api/agents/global"),
  getRepoAgents: (repo: string) =>
    request<{ content: string }>(`/api/agents/repo/${repo}`),
  updateRepoAgents: (repo: string, content: string) =>
    request<void>(`/api/agents/repo/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  // Instructions
  getGlobalInstructions: () =>
    request<{ content: string }>("/api/instructions/global"),
  updateGlobalInstructions: (content: string) =>
    request<void>("/api/instructions/global", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getRepoInstructions: (repo: string) =>
    request<{ content: string }>(`/api/instructions/repo/${repo}`),
  updateRepoInstructions: (repo: string, content: string) =>
    request<void>(`/api/instructions/repo/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  // Regenerate (re-run onboard for a repo)
  regenerateRepo: (repo: string) =>
    request<{ status: string }>(`/api/repos/${repo}/regenerate`, {
      method: "POST",
    }),

  // Notifications
  getNotifications: () => request<NotificationPrefs>("/api/notifications"),
  updateNotifications: (prefs: NotificationPrefs) =>
    request<void>("/api/notifications", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),

  // Jira integration
  getJiraCheck: () => request<JiraCheck>("/api/integrations/jira/check"),
  generateJiraSecret: () =>
    request<{ token: string; webhook_secret: string }>(
      "/api/integrations/jira/secret",
      { method: "POST" },
    ),
  deleteJiraSecret: () =>
    request<void>("/api/integrations/jira/secret", { method: "DELETE" }),
  deleteJiraIntegration: () =>
    request<void>("/api/integrations/jira/check", { method: "DELETE" }),
  getJiraConfig: () => request<JiraConfig>("/api/integrations/jira/config"),
  updateJiraConfig: (body: Partial<JiraConfig>) =>
    request<void>("/api/integrations/jira/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  fetchJiraProjects: () =>
    request<{ projects: JiraProject[] }>(
      "/api/integrations/jira/projects/fetch",
    ),
  updateJiraProjects: (projects: JiraProject[]) =>
    request<void>("/api/integrations/jira/projects", {
      method: "PUT",
      body: JSON.stringify({ projects }),
    }),

  // Usage
  getUsage: () => request<UsageInfo>("/api/usage"),

  // Token limits: three monthly limits, each optional.
  getBudget: () => request<BudgetInfo>("/api/settings/budget"),
  updateBudget: (limits: TokenLimitsInput) =>
    request<void>("/api/settings/budget", {
      method: "PUT",
      body: JSON.stringify(limits),
    }),

  // Model Provider
  getModelProvider: () =>
    request<ModelProviderConfig>("/api/settings/model-provider"),
  updateModelProvider: (config: {
    api_key?: string;
    primary_model: string;
    heavy_model: string;
  }) =>
    request<{ status: string; provider: string }>(
      "/api/settings/model-provider",
      { method: "PUT", body: JSON.stringify(config) },
    ),
  deleteModelProvider: () =>
    request<void>("/api/settings/model-provider", { method: "DELETE" }),

  // Workflow
  getWorkflowSettings: () =>
    request<WorkflowSettings>("/api/settings/workflow"),
  updateWorkflowSettings: (settings: WorkflowSettings) =>
    request<void>("/api/settings/workflow", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Git conventions: branch, commit and PR title templates
  getGitConventions: () =>
    request<GitConventions>("/api/settings/git-conventions"),
  updateGitConventions: (templates: GitConventionTemplates) =>
    requestWithBody<GitConventions, { field: keyof GitConventionTemplates }>("/api/settings/git-conventions", {
      method: "PUT",
      body: JSON.stringify(templates),
    }),

  // Plans
  listPlans: (cursor?: string) =>
    request<{ plans: Plan[]; next_cursor?: string | null }>(
      // The cursor is a sort key like "PLAN#01…": unencoded, "#" starts a URL fragment.
      `/api/plans${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  planChat: (messages: { role: string; content: string }[]) =>
    request<{ content: string; mcp_servers?: string[] }>("/api/plans/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  createPlan: (body: {
    title: string;
    description?: string;
    repo?: string;
    destination?: "github" | "jira";
    tasks?: Partial<Task>[];
    mcp_servers?: string[];
    /** The plan chat it was made in. */
    chat_id?: string;
  }) =>
    request<{ plan_id: string }>("/api/plans", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPlan: (planId: string) =>
    request<Plan & { tasks: Task[] }>(`/api/plans/${planId}`),
  updatePlan: (
    planId: string,
    body: Partial<{
      title: string;
      description: string;
      status: string;
      destination: string;
    }>,
  ) =>
    request<void>(`/api/plans/${planId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePlan: (planId: string) =>
    request<void>(`/api/plans/${planId}`, { method: "DELETE" }),
  addTask: (planId: string, body: Partial<Task>) =>
    request<{ task_id: string }>(`/api/plans/${planId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTask: (planId: string, taskId: string, body: Partial<Task>) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}`, { method: "DELETE" }),
  approveTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}/approve`, {
      method: "POST",
    }),
  rejectTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}/reject`, {
      method: "POST",
    }),
  forceRunTask: (planId: string, taskId: string) =>
    request<{ status: string }>(
      `/api/plans/${planId}/tasks/${taskId}/force-run`,
      { method: "POST" },
    ),
  executePlan: (planId: string) =>
    request<{ status: string; tasks_queued: number }>(
      `/api/plans/${planId}/execute`,
      { method: "POST" },
    ),
  approveAllAndExecute: (planId: string) =>
    request<{ status: string; tasks_queued: number }>(
      `/api/plans/${planId}/approve-and-execute`,
      { method: "POST" },
    ),
  generatePlanOpenspec: (planId: string) =>
    request<{ files: string[] }>(`/api/plans/${planId}/openspec/generate`, {
      method: "POST",
    }),
  getPlanOpenspec: (planId: string) =>
    request<{ proposal: string; design: string; tasks: string; spec: string }>(
      `/api/plans/${planId}/openspec`,
    ),

  // Plan Templates
  listTemplates: (params?: { limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const q = qs.toString();
    return request<{ templates: Template[]; next_cursor?: string }>(
      `/api/plans/templates${q ? `?${q}` : ""}`,
    );
  },
  createTemplate: (body: {
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    task_templates?: TaskTemplate[];
  }) =>
    request<{ template_id: string }>("/api/plans/templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createTemplateFromPlan: (
    planId: string,
    body: {
      title?: string;
      description?: string;
      category?: string;
      tags?: string[];
    },
  ) =>
    request<{ template_id: string }>(
      `/api/plans/templates/from-plan/${planId}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  getTemplate: (templateId: string) =>
    request<Template>(`/api/plans/templates/${templateId}`),
  deleteTemplate: (templateId: string) =>
    request<void>(`/api/plans/templates/${templateId}`, { method: "DELETE" }),
  useTemplate: (
    templateId: string,
    body: {
      title?: string;
      description?: string;
      repo?: string;
      destination?: string;
    },
  ) =>
    request<{ plan_id: string }>(`/api/plans/templates/${templateId}/use`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Infrastructure
  getInfrastructure: () => request<InfraAnalysis>("/api/infrastructure"),
  refreshInfrastructure: () =>
    request<{ status: string }>("/api/infrastructure/refresh", {
      method: "POST",
    }),
  getRepoInfrastructure: (repo: string) =>
    request<InfraAnalysis>(`/api/infrastructure/repo/${repo}`),
  refreshRepoInfrastructure: (repo: string) =>
    request<{ status: string }>(`/api/infrastructure/repo/${repo}/refresh`, {
      method: "POST",
    }),

  // User management
  listUsers: () => request<{ users: TeamUser[] }>("/api/users"),
  inviteUser: (email: string, role?: string) =>
    request<{ status: string; user_id: string }>("/api/users/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  updateUserRole: (userId: string, role: string) =>
    request<{ status: string }>(
      `/api/users/${encodeURIComponent(userId)}/role`,
      { method: "PUT", body: JSON.stringify({ role }) },
    ),
  removeUser: (userId: string) =>
    request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  resendInvite: (userId: string) =>
    request<{ status: string }>(
      `/api/users/${encodeURIComponent(userId)}/resend`,
      { method: "POST" },
    ),
  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>("/api/users/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    }),
  mfaSetup: (password: string) =>
    request<{ secret: string; qr_uri: string; session: string }>(
      "/api/users/mfa/setup",
      { method: "POST", body: JSON.stringify({ password }) },
    ),
  mfaVerifySetup: (password: string, code: string, session: string) =>
    request<{ status: string }>("/api/users/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ password, code, session }),
    }),
  mfaDisable: () =>
    request<{ status: string }>("/api/users/mfa", { method: "DELETE" }),
  // Self-hosted: one organization, who may join, and two-factor sign-in.
  myTwoFactor: () => request<MyTwoFactor>("/api/users/2fa"),
  appTwoFactorSetup: () =>
    request<{ secret: string; qr_uri: string }>("/api/users/2fa/app/setup", { method: "POST" }),
  appTwoFactorVerify: (code: string) =>
    request<{ status: string }>("/api/users/2fa/app/verify", { method: "POST", body: JSON.stringify({ code }) }),
  appTwoFactorDisable: (code: string) =>
    request<{ status: string }>("/api/users/2fa/app", { method: "DELETE", body: JSON.stringify({ code }) }),
  verifySecondStep: (code: string) =>
    request<{ status: string; team_id: string }>("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  signInSettings: () => request<SignInSettings>("/api/sign-in"),
  updateSignInSettings: (body: { domains?: string[]; require_2fa?: boolean }) =>
    request<{ domains: string[]; require_2fa: boolean; require_2fa_since: string | null }>("/api/sign-in", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  resetTwoFactor: (userId: string, verifiedHow: string) =>
    request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}/2fa/reset`, {
      method: "POST",
      body: JSON.stringify({ verified_how: verifiedHow }),
    }),

  // AWS Connections (Log Analyzer)
  // Alert routes: SNS topic → repo, turning alerts into pull requests
  listAlertRoutes: () =>
    request<{ endpoint_path: string; routes: AlertRoute[] }>(
      "/api/alert-routes",
    ),
  saveAlertRoute: (route: Omit<AlertRoute, "updated_at" | "webhooks"> & ChannelsInput) =>
    request<{ ok: boolean }>("/api/alert-routes", {
      method: "PUT",
      body: JSON.stringify(route),
    }),
  getAlertBudget: () => request<AlertBudget>("/api/alert-budget"),
  saveAlertBudget: (daily_tokens: number) =>
    request<{ ok: boolean }>("/api/alert-budget", {
      method: "PUT",
      body: JSON.stringify({ daily_tokens }),
    }),
  listTopicAlarms: (topic_arn: string) =>
    request<{ alarms: TopicAlarm[]; messages?: string[]; error?: string }>(
      `/api/alert-routes/alarms?topic_arn=${encodeURIComponent(topic_arn)}`,
    ),
  /** The repo a rule for these alarms should fix in, from what the alarms watch. */
  resolveAlertRepo: (topic_arn: string, alarms: string[]) =>
    request<RepoResolution>("/api/alert-routes/resolve-repo", {
      method: "POST",
      body: JSON.stringify({ topic_arn, alarms }),
    }),
  deleteAlertRoute: (topic_arn: string) =>
    request<void>(
      `/api/alert-routes?topic_arn=${encodeURIComponent(topic_arn)}`,
      { method: "DELETE" },
    ),
  getAlertNotify: () => request<AlertNotifySettings>("/api/alert-notify"),
  saveAlertNotify: (s: { enabled: boolean } & ChannelsInput) =>
    request<{ ok: boolean }>("/api/alert-notify", {
      method: "PUT",
      body: JSON.stringify(s),
    }),
  /** Post a sample message to one channel: a URL being typed, or the destination's saved one. */
  testNotify: (t: NotifyDestination & { channel: ChatChannel; url?: string }) =>
    request<{ ok: boolean; error?: string }>("/api/notify/test", {
      method: "POST",
      body: JSON.stringify(t),
    }),
  listAlerts: (after?: string) =>
    request<{ alerts: AlertEvent[]; next?: string | null }>(
      `/api/alerts${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    ),
  getAlert: (id: string) =>
    request<AlertEventDetail>(`/api/alerts/event?id=${encodeURIComponent(id)}`),
  listAwsConnections: () =>
    request<{ connections: AwsConnection[] }>("/api/aws-connections"),
  createAwsConnection: (role_arn: string, region?: string) =>
    request<{
      connection_id?: string;
      external_id?: string;
      status?: string;
      error?: string;
      message?: string;
    }>("/api/aws-connections", {
      method: "POST",
      body: JSON.stringify({ role_arn, region }),
    }),
  getRecNotify: () =>
    request<{
      notify_mode: "team" | "custom" | "off";
      webhooks: WebhooksView;
    }>("/api/recommendations/notify"),
  saveRecNotify: (
    notify_mode: "team" | "custom" | "off",
    channels: ChannelsInput,
  ) =>
    request<{ ok: boolean }>("/api/recommendations/notify", {
      method: "PUT",
      body: JSON.stringify({ notify_mode, ...channels }),
    }),
  updateAwsConnection: (
    id: string,
    body: Partial<{ role_arn: string; region: string; log_groups: string[] }>,
  ) =>
    request<{ status: string }>(`/api/aws-connections/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAwsConnection: (id: string) =>
    request<{ status: string }>(`/api/aws-connections/${id}`, {
      method: "DELETE",
    }),
  testAwsConnection: (id: string) =>
    request<{ status: string; message: string }>(
      `/api/aws-connections/${id}/test`,
      { method: "POST" },
    ),
  discoverLogGroups: (id: string) =>
    request<{ log_groups: LogGroup[] }>(
      `/api/aws-connections/${id}/log-groups`,
    ),
  getCfnUrl: () => request<AwsRoleSetup>("/api/aws-connections/cfn-url"),
  /** The role template built into this install's release, with its account filled in. */
  downloadAwsTemplate: async (which: "role" | "update" = "role") => {
    const res = await fetch(`${apiBase()}/api/aws-connections/template?which=${which}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new ApiError(httpErrorMessage(res.status), res.status);
    return res.text();
  },

  // Recommendations
  listRecommendations: (params?: { status?: string; severity?: string }) =>
    request<{ recommendations: Recommendation[] }>(
      `/api/recommendations${params ? `?${new URLSearchParams(params as Record<string, string>)}` : ""}`,
    ),
  createPlanFromRecommendation: (id: string) =>
    request<{ plan_id: string; status: string }>(
      `/api/recommendations/${id}/plan`,
      { method: "POST" },
    ),
  dismissRecommendation: (id: string) =>
    request<{ status: string }>(`/api/recommendations/${id}/dismiss`, {
      method: "POST",
    }),

  // Logs: the log analyzer's findings and the fix runs started from them
  listLogFindings: () => request<LogFindingsList>("/api/log-findings"),
  logFindingSamples: (id: string) =>
    request<{ samples: LogSample[]; error?: string }>(`/api/log-findings/${encodeURIComponent(id)}/samples`),
  /** Start a fix run. `repo` empty: the repo mapped to the finding's log group. */
  createLogFix: (id: string, body: { repo?: string; remember?: boolean }) =>
    request<{ status: string; ticket_id: string; repo: string }>(`/api/log-findings/${encodeURIComponent(id)}/fix`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Which repo the finding's code lives in: saved, or worked out from the evidence. */
  getLogFindingRepo: (id: string, refresh = false) =>
    request<RepoResolution>(`/api/log-findings/${encodeURIComponent(id)}/repo${refresh ? "?refresh=1" : ""}`),
  setLogFindingStatus: (id: string, action: "ignore" | "acknowledge" | "reopen") =>
    request<{ ok: boolean }>(`/api/log-findings/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" }),
  getLogAutofix: () => request<{ autofix: LogAutofix; runs_today: number }>("/api/log-findings/autofix"),
  saveLogAutofix: (autofix: LogAutofix) =>
    request<{ ok: boolean; autofix: LogAutofix }>("/api/log-findings/autofix", {
      method: "PUT",
      body: JSON.stringify(autofix),
    }),

  // Plugins
  getPluginCatalog: () =>
    request<{ plugins: PluginDef[] }>("/api/plugins/catalog"),
  listEnabledPlugins: () =>
    request<{ plugins: EnabledPlugin[] }>("/api/plugins"),
  enablePlugin: (id: string) =>
    request<{ status: string; plugin_id: string }>(
      `/api/plugins/${id}/enable`,
      { method: "POST" },
    ),
  disablePlugin: (id: string) =>
    request<{ status: string; plugin_id: string }>(`/api/plugins/${id}`, {
      method: "DELETE",
    }),
  updatePluginCredentials: (id: string, credentials: Record<string, string>) =>
    request<{ status: string; error?: string }>(
      `/api/plugins/${id}/credentials`,
      { method: "PUT", body: JSON.stringify({ credentials }) },
    ),
  updatePluginPrompt: (id: string, custom_prompt: string) =>
    request<{ status: string; error?: string }>(`/api/plugins/${id}/prompt`, {
      method: "PUT",
      body: JSON.stringify({ custom_prompt }),
    }),
  testPluginConnection: (id: string) =>
    request<{ status: string; tool_count?: number; message?: string }>(
      `/api/plugins/${id}/test`,
      { method: "POST" },
    ),

  // Memory
  listMemories: (
    repo: string,
    page = 1,
    pageSize = 50,
    search?: string,
    memoryType?: string,
    filters: MemoryFilters = {},
  ) => {
    const params = new URLSearchParams({
      repo,
      page: String(page),
      page_size: String(pageSize),
    });
    if (search) params.set("search", search);
    if (memoryType) params.set("memory_type", memoryType);
    if (filters.source) params.set("source", filters.source);
    if (filters.topic) params.set("topic", filters.topic);
    if (filters.pinned !== undefined) params.set("pinned", String(filters.pinned));
    if (filters.sort) params.set("sort", filters.sort);
    return request<MemoryListResponse>(`/api/memories?${params}`);
  },
  createMemory: (data: { repo: string; content: string; topic: string; pinned: boolean }) =>
    request<{ id: string }>(`/api/memories`, { method: "POST", body: JSON.stringify(data) }),
  updateMemory: (id: string, data: { repo: string; content?: string; topic?: string; pinned?: boolean }) =>
    request<{ updated: string }>(`/api/memories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  previewMemoryRecall: (repo: string, text: string) =>
    request<MemoryPreview>(`/api/memories/preview`, { method: "POST", body: JSON.stringify({ repo, text }) }),
  getAgentProfiles: (repo: string) =>
    request<{ repo: string; profiles: AgentProfile[] }>(`/api/memories/agents?repo=${encodeURIComponent(repo)}`),
  getMemoryStats: (repo: string) =>
    request<MemoryStats>(
      `/api/memories/stats?repo=${encodeURIComponent(repo)}`,
    ),
  deleteMemory: (id: string, repo: string) =>
    request<{ deleted: string }>(
      `/api/memories/${id}?repo=${encodeURIComponent(repo)}`,
      { method: "DELETE" },
    ),

  // Reviewer agent
  // Code graph — its own feature (the planner, the coding agent, CI fixes
  // and the reviewer all use it)
  getGraphRepos: () => request<{ repos: GraphRepo[] }>(`/api/graph/repos`),
  getGraphStatus: (repo: string) =>
    request<GraphStatus>(`/api/graph/status?repo=${encodeURIComponent(repo)}`),
  searchGraphSymbol: (repo: string, q: string) =>
    request<GraphSymbolResult>(
      `/api/graph/symbol?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(q)}`,
    ),
  getGraphNeighborhood: (repo: string, path: string) =>
    request<GraphNeighborhood>(
      `/api/graph/neighborhood?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
    ),
  setGraphEnabled: (repo: string, enabled: boolean) =>
    request<void>(`/api/graph/config/${repo}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  rebuildGraph: (repo: string) =>
    request<void>(`/api/graph/rebuild/${repo}`, { method: "POST" }),
  getReviewerConfig: (repo: string) =>
    request<ReviewerConfig>(`/api/reviewer/config/${repo}`),
  updateReviewerConfig: (repo: string, config: ReviewerConfig & ChannelsInput) =>
    request<void>(`/api/reviewer/config/${repo}`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  getOrgReviewInstructions: () =>
    request<{ instructions: string }>(`/api/reviewer/org-config`),
  updateOrgReviewInstructions: (instructions: string) =>
    request<void>(`/api/reviewer/org-config`, {
      method: "PUT",
      body: JSON.stringify({ instructions }),
    }),
  /** The team's own public domains agents may check pages on; each covers its subdomains. */
  getWebDomains: () => request<{ web_domains?: string[] }>(`/api/reviewer/org-config`).then((r) => r.web_domains ?? []),
  /** Replaces the list (admin). Entries that aren't domains are refused with a 400 naming them. */
  setWebDomains: (domains: string[]) =>
    request<{ web_domains: string[] }>(`/api/reviewer/org-config`, {
      method: "PUT",
      body: JSON.stringify({ web_domains: domains }),
    }).then((r) => r.web_domains ?? []),
  listReviews: (repo?: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (repo) params.set("repo", repo);
    if (cursor) params.set("cursor", cursor);
    return request<{ reviews: Review[]; next?: string | null }>(
      `/api/reviewer/reviews?${params}`,
    );
  },
  getReview: (sk: string) =>
    request<Review>(`/api/reviewer/review?sk=${encodeURIComponent(sk)}`),
  /** Where the reviewer is with each PR now (queued, reviewing, waiting for CI or people, merged…). */
  listLivePrs: (repo?: string) => {
    const params = new URLSearchParams();
    if (repo) params.set("repo", repo);
    const q = params.toString();
    return request<{ prs?: LivePr[] }>(`/api/reviewer/live${q ? `?${q}` : ""}`).then((r) => r.prs ?? []);
  },
  /** A repo's open pull requests, most recently updated first (read from GitHub through the app). */
  listOpenPrs: (repo: string) =>
    request<{ prs?: OpenPr[] }>(`/api/reviewer/open-prs?repo=${encodeURIComponent(repo)}`).then((r) => r.prs ?? []),
  rateReview: (sk: string, rating: "up" | "down" | "none", comment?: string) =>
    request<void>(`/api/reviewer/review/rate`, {
      method: "POST",
      body: JSON.stringify({ sk, rating, comment }),
    }),
  /** One PR's auto-merge gate: state, checklist, who stopped it, every stop and re-arm. */
  getGate: (repo: string, pr: number) =>
    request<GateDetail>(`/api/reviewer/gate?${new URLSearchParams({ repo, pr: String(pr) })}`),
  /** Stop or re-arm one PR's auto-merge. A re-arm checks every condition again before merging. */
  controlGate: (repo: string, pr: number, action: GateAction) =>
    request<GateControlResult>(`/api/reviewer/gate`, {
      method: "POST",
      body: JSON.stringify({ repo, pr, action }),
    }),
  reReview: (repo: string, pr: number) =>
    request<{ status: "queued" | "skipped"; reason?: string }>(
      `/api/reviewer/re-review`,
      {
        method: "POST",
        body: JSON.stringify({ repo, pr }),
      },
    ),
  listReleases: (repo?: string, cursor?: string) => {
    const params = new URLSearchParams();
    if (repo) params.set("repo", repo);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return request<{ releases: Release[]; next?: string | null }>(
      `/api/releases${qs ? `?${qs}` : ""}`,
    );
  },
  sendRelease: (repo: string, tag: string, resend: "" | "email" | "all") =>
    request<{ status: string }>(`/api/releases/send`, {
      method: "POST",
      body: JSON.stringify({ repo, tag, resend }),
    }),
  pendingReleases: (repo?: string) =>
    request<{ waiting: WaitingRelease[]; blocked: BlockedRelease[] }>(
      `/api/releases/pending${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`,
    ),
  releaseNow: (repo: string) =>
    request<{ status: string }>(`/api/releases/now`, {
      method: "POST",
      body: JSON.stringify({ repo }),
    }),

  // Data sources
  listDataSources: () => request<{ sources: DataSource[] }>("/api/data-sources"),
  probeDataSourceApi: (url: string) =>
    request<DataSourceProbe>("/api/data-sources/api/probe", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  checkDataSourceApi: (url: string, key: string) =>
    request<DataSourceCheckResult>("/api/data-sources/api/check", {
      method: "POST",
      body: JSON.stringify({ url, key }),
    }),
  /** Does not throw on failed checks: the body (with `checks`) is returned so they can be shown. */
  createDataSourceApi: (data: { url: string; key: string; name?: string }) =>
    requestWithBody<{ source: DataSource; checks: DataSourceCheck[] }, { checks: DataSourceCheck[] }>(
      "/api/data-sources/api",
      { method: "POST", body: JSON.stringify(data) },
    ),
  /** A REST API or OpenSearch cluster: checked, then saved switched off. Does not throw on failed checks. */
  createDataSourceReader: (
    kind: "rest" | "search",
    data: DataSourceReaderSettings & { name: string; key: string; instructions?: string; hidden_fields?: string[] },
  ) =>
    requestWithBody<{ source: DataSource; checks: DataSourceCheck[] }, { checks: DataSourceCheck[] }>(
      `/api/data-sources/${kind}`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  updateDataSource: (
    id: string,
    data: DataSourceReaderSettings & {
      enabled?: boolean;
      hidden_fields?: string[];
      repos?: string[];
      name?: string;
      log_groups?: string[];
      instructions?: string;
    },
  ) =>
    request<{ source: DataSource }>(`/api/data-sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  /** Does not throw on failed checks, like `createDataSourceApi`. */
  replaceDataSourceKey: (id: string, key: string) =>
    requestWithBody<{ source: DataSource; checks: DataSourceCheck[] }, { checks: DataSourceCheck[] }>(
      `/api/data-sources/${encodeURIComponent(id)}/key`,
      { method: "POST", body: JSON.stringify({ key }) },
    ),
  testDataSource: (id: string) =>
    request<DataSourceCheckResult & { source: DataSource }>(
      `/api/data-sources/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),
  deleteDataSource: (id: string) =>
    request<{ ok: true }>(`/api/data-sources/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getIntegrations: () => request<IntegrationsResponse>("/api/integrations"),
  /** Self-hosted installs (install admins): this build, the latest release, settings, history. */
  getSystemVersion: () => request<SystemVersion>("/api/system/version"),
  setAutoUpdate: (settings: Partial<AutoUpdateSettings>) =>
    request<{ settings: AutoUpdateSettings }>("/api/system/auto-update", { method: "PUT", body: JSON.stringify(settings) }),
  /**
   * Update to `version` (default: the latest). Refused with the model check
   * when a model the release calls was refused; `skipCheck` passes only a
   * failure on a model the release doesn't call.
   */
  updateNow: (version?: string, skipCheck = false) =>
    requestWithBody<UpdateEntry, { model_check: ModelCheck }>("/api/system/update", {
      method: "POST",
      body: JSON.stringify({ ...(version ? { version } : {}), ...(skipCheck ? { skip_check: true } : {}) }),
    }),
  /** The next release's model check, run again now. */
  checkUpdateModels: () => request<{ model_check: ModelCheck | null }>("/api/system/update-check", { method: "POST", body: "{}" }),
  /** How the install calls Claude (install admins, self-hosted). */
  getSystemModels: () => request<SystemModels>("/api/system/models"),
  /** The test calls a switch would make, nothing saved. */
  checkSystemModels: (to: ModelsChoice) =>
    request<{ ok: boolean; results: ModelAccess[] }>("/api/system/models/check", { method: "POST", body: JSON.stringify(to) }),
  /** Switch, once every model answers; refused with the results otherwise. */
  setSystemModels: (to: ModelsChoice) =>
    requestWithBody<SystemModels, { results: ModelAccess[] }>("/api/system/models", { method: "PUT", body: JSON.stringify(to) }),
  rollbackInstall: () => request<UpdateEntry>("/api/system/rollback", { method: "POST", body: "{}" }),
  // Setup checks and update readiness (install admins), each with its fix.
  getSystemChecks: () => request<SystemChecks>("/api/system/checks"),
  getSystemPreflight: () => request<SystemPreflight>("/api/system/preflight"),
  sendTestEmail: () => request<{ sent: boolean; to?: string; reason?: string }>("/api/system/test-email", { method: "POST", body: "{}" }),
  // Your own domain (install admins): status with the records to add, set, back to the AWS address.
  getSystemDomain: () => request<SystemDomain>("/api/system/domain"),
  setSystemDomain: (hostname: string) =>
    request<DomainView>("/api/system/domain", { method: "PUT", body: JSON.stringify({ hostname }) }),
  removeSystemDomain: () => request<DomainView>("/api/system/domain", { method: "DELETE" }),

  // Deliveries (team admins): every webhook and notice in and out, with why each failed.
  listDeliveries: (f: DeliveryFilter = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== "all") q.set(k, String(v));
    const s = q.toString();
    return request<DeliveriesReply>(`/api/deliveries${s ? `?${s}` : ""}`);
  },
  getDelivery: (id: string) => request<DeliveryDetailReply>(`/api/deliveries/${encodeURIComponent(id)}`),
  /** The Deliveries overview: counts per hour or day for a period, against the period before. */
  getDeliveryAnalytics: (f: DeliveryAnalyticsFilter = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== "all") q.set(k, String(v));
    const s = q.toString();
    return request<DeliveryAnalytics>(`/api/deliveries/analytics${s ? `?${s}` : ""}`);
  },
  redeliver: (id: string) =>
    requestWithBody<{ message?: string }, { code?: string }>(`/api/deliveries/${encodeURIComponent(id)}/redeliver`, { method: "POST", body: "{}" }),

  // Hybrid (install admins, self-hosted only): connect this install to Coderhelm's apps and address.
  getHybrid: (deep = false) => request<HybridStatus>(`/api/system/hybrid${deep ? "?deep=1" : ""}`),
  registerHybrid: () => request<HybridStatus>("/api/system/hybrid/register", { method: "POST", body: "{}" }),
  leaveHybrid: () => request<HybridStatus>("/api/system/hybrid", { method: "DELETE" }),
  checkHybridName: (name: string) => request<HybridNameCheck>(`/api/system/hybrid/names/${encodeURIComponent(name)}`),
  claimHybridName: (name: string) => request<HybridStatus>("/api/system/hybrid/name", { method: "PUT", body: JSON.stringify({ name }) }),
  releaseHybridName: () => request<HybridStatus>("/api/system/hybrid/name", { method: "DELETE" }),
  linkHybridGithub: (return_url?: string) =>
    request<{ state: string; install_url: string }>("/api/system/hybrid/github/link", { method: "POST", body: JSON.stringify(return_url ? { return_url } : {}) }),
  setHybridGithubRepos: (installationId: number, repositories: string[]) =>
    request<HybridStatus>(`/api/system/hybrid/github/${installationId}`, { method: "PUT", body: JSON.stringify({ repositories }) }),
  unlinkHybridGithub: (installationId: number) => request<HybridStatus>(`/api/system/hybrid/github/${installationId}`, { method: "DELETE" }),
  setHybridSettings: (s: HybridSettingsPatch) => request<HybridStatus>("/api/system/hybrid/settings", { method: "PUT", body: JSON.stringify(s) }),

  // Remote MCP servers
  listMcpServers: () =>
    request<{ servers: McpServer[]; can_edit: boolean; redirect_uri: string }>("/api/mcp-servers"),
  detectMcpServer: (url: string) =>
    request<{ url: string; detected: McpDetected; redirect_uri: string }>("/api/mcp-servers/detect", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  addMcpServer: (body: McpAddRequest) =>
    request<{ server: McpServer; detected: McpDetected }>("/api/mcp-servers", { method: "POST", body: JSON.stringify(body) }),
  // ── Agent permissions ──────────────────────────────────────────────
  getAgentPolicy: () => request<PolicyView>("/api/agents/policy"),
  saveAgentSettings: (body: {
    version: number;
    autonomy?: string;
    ask_timeout_secs?: number;
    limit_egress?: boolean;
    egress?: string[];
  }) => request<PolicyView>("/api/agents/policy", { method: "PUT", body: JSON.stringify(body) }),
  addAgentRule: (version: number, rule: Omit<Rule, "id" | "source" | "created_by" | "created_at">) =>
    request<PolicyView>("/api/agents/policy/rules", { method: "POST", body: JSON.stringify({ version, rule }) }),
  removeAgentRule: (version: number, id: string) =>
    request<PolicyView>(`/api/agents/policy/rules/${encodeURIComponent(id)}?version=${version}`, { method: "DELETE" }),
  applyAgentPreset: (version: number, preset: Preset) =>
    request<PolicyView>("/api/agents/policy/preset", { method: "POST", body: JSON.stringify({ version, preset }) }),
  setAgentSwitch: (version: number, agent: AgentKey, on: boolean, repo?: string) =>
    request<PolicyView>("/api/agents/policy/switches", { method: "PUT", body: JSON.stringify({ version, agent, on, repo }) }),
  setSandboxCommands: (version: number, repo: string, commands: string[]) =>
    request<PolicyView>("/api/agents/policy/commands", { method: "PUT", body: JSON.stringify({ version, repo, commands }) }),
  decideCommandSuggestion: (version: number, repo: string, command: string, accept: boolean) =>
    request<PolicyView>("/api/agents/policy/suggestions", { method: "POST", body: JSON.stringify({ version, repo, command, accept }) }),
  testAgentCall: (body: { agent: AgentKey; tool?: string; repo?: string; command?: string; kind?: string }) =>
    request<TestResult>("/api/agents/policy/test", { method: "POST", body: JSON.stringify(body) }),
  pauseAgents: (reason: string, until?: string) =>
    request<PolicyView>("/api/agents/pause", { method: "POST", body: JSON.stringify({ reason, until }) }),
  resumeAgents: () => request<PolicyView>("/api/agents/pause", { method: "DELETE" }),
  listApprovals: (q: { status?: "pending" | "all"; run_id?: string; thread_id?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set("status", q.status);
    if (q.run_id) p.set("run_id", q.run_id);
    if (q.thread_id) p.set("thread_id", q.thread_id);
    const qs = p.toString();
    return request<{ approvals: Approval[]; can: ApprovalCan }>(`/api/agents/approvals${qs ? `?${qs}` : ""}`);
  },
  getApproval: (id: string) =>
    request<{ approval: Approval; can: ApprovalCan }>(`/api/agents/approvals/${encodeURIComponent(id)}`),
  decideApproval: (id: string, body: { approve: boolean; choice?: Choice; via?: Via; note?: string }) =>
    request<{ approval: Approval }>(`/api/agents/approvals/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  agentActivity: (limit = 50) => request<{ events: AgentEvent[] }>(`/api/agents/activity?limit=${limit}`),
  declineSignIn: (thread_id: string, server_id: string) =>
    request<{ declined: boolean }>("/api/agents/sign-in/decline", { method: "POST", body: JSON.stringify({ thread_id, server_id }) }),

  /** Where to send the browser to sign in. */
  connectMcpServer: (id: string) =>
    request<{ authorize_url: string }>(`/api/mcp-servers/${encodeURIComponent(id)}/connect`, { method: "POST" }),
  finishMcpSignIn: (body: { state: string; code?: string; error?: string; iss?: string }) =>
    request<{ server: McpServer; tools_error: string | null }>("/api/mcp-servers/oauth/callback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnectMcpServer: (id: string) =>
    request<{ server: McpServer; revoked: boolean }>(`/api/mcp-servers/${encodeURIComponent(id)}/connection`, { method: "DELETE" }),
  removeMcpServer: (id: string) =>
    request<{ status: string }>(`/api/mcp-servers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setMcpClient: (id: string, client_id: string, client_secret: string) =>
    request<{ server: McpServer }>(`/api/mcp-servers/${encodeURIComponent(id)}/client`, {
      method: "PUT",
      body: JSON.stringify({ client_id, client_secret }),
    }),
  setMcpKey: (id: string, header_name: string, header_value: string) =>
    request<{ server: McpServer }>(`/api/mcp-servers/${encodeURIComponent(id)}/key`, {
      method: "PUT",
      body: JSON.stringify({ header_name, header_value }),
    }),
  setMcpTools: (id: string, allowed: string[]) =>
    request<{ server: McpServer }>(`/api/mcp-servers/${encodeURIComponent(id)}/tools`, {
      method: "PUT",
      body: JSON.stringify({ allowed }),
    }),
  approveMcpTools: (id: string) =>
    request<{ server: McpServer }>(`/api/mcp-servers/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  checkMcpServer: (id: string) =>
    request<{ server: McpServer; error: string | null }>(`/api/mcp-servers/${encodeURIComponent(id)}/check`, { method: "POST" }),
  setMcpPrompt: (id: string, custom_prompt: string) =>
    request<{ server: McpServer }>(`/api/mcp-servers/${encodeURIComponent(id)}/prompt`, {
      method: "PUT",
      body: JSON.stringify({ custom_prompt }),
    }),
  getMcpActivity: (id: string) =>
    request<{ calls: McpCall[] }>(`/api/mcp-servers/${encodeURIComponent(id)}/activity`),
  /** Live check of the role against this release's permissions. `pressed`: someone pressed Update, so name a missing or failed stack. */
  checkAwsPermissions: (account: string, pressed = false) =>
    request<AwsAbilityReply & { permissions: AwsPermissions | null }>(
      `/api/aws-connections/${encodeURIComponent(account)}/permissions/check`,
      { method: "POST", body: JSON.stringify({ pressed }) },
    ),
  checkAwsAbilities: (account: string) =>
    request<AwsAbilityReply>(`/api/aws-connections/${encodeURIComponent(account)}/abilities/check`, { method: "POST" }),
  setAwsAbilities: (account: string, body: { metrics?: boolean; airflow?: boolean; airflow_environments?: string[] }) =>
    request<AwsAbilityReply>(`/api/aws-connections/${encodeURIComponent(account)}/abilities`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  saveConnector: (id: ConnectorId, body: Record<string, unknown>) =>
    request<{ connector: Connector }>(`/api/connectors/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  testConnector: (id: ConnectorId) =>
    request<{ connector: Connector }>(`/api/connectors/${encodeURIComponent(id)}/test`, { method: "POST" }),
  removeConnector: (id: ConnectorId) =>
    request<{ ok: true }>(`/api/connectors/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getHiddenSuggestions: (id: string) =>
    request<HiddenSuggestions>(`/api/data-sources/${encodeURIComponent(id)}/hidden-suggestions`),
  /** Accepted entries join the hidden list; dismissed ones are never suggested again. */
  decideHiddenSuggestions: (id: string, body: { accept?: string[]; dismiss?: string[]; refresh?: boolean }) =>
    request<HiddenSuggestions & { source: DataSource }>(
      `/api/data-sources/${encodeURIComponent(id)}/hidden-suggestions`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  getDataSourceSamples: (id: string) =>
    request<{ samples: DataSourceSample[] }>(`/api/data-sources/${encodeURIComponent(id)}/samples`),
  tryDataSource: (id: string, query: string, opts: { log_groups?: string[]; since?: string; database?: string } = {}) =>
    request<DataSourceTryResult>(`/api/data-sources/${encodeURIComponent(id)}/try`, {
      method: "POST",
      body: JSON.stringify({ query, ...opts }),
    }),
  getAwsSetup: () => request<AwsSetup>("/api/data-sources/aws/setup"),
  /** Checks a role and lists what it can reach. Saves nothing. Failed checks come back with `ok: false`. */
  connectAws: (access: AwsAccess) =>
    request<AwsConnectResult>("/api/data-sources/aws/connect", {
      method: "POST",
      body: JSON.stringify(access),
    }),
  /** Does not throw on failed checks, like `createDataSourceApi`. */
  createLogsSource: (data: AwsAccess & { log_groups: string[]; name?: string }) =>
    requestWithBody<{ source: DataSource; checks: DataSourceCheck[] }, { checks: DataSourceCheck[] }>(
      "/api/data-sources/logs",
      { method: "POST", body: JSON.stringify(data) },
    ),
  /** Does not throw on failed checks, like `createDataSourceApi`. */
  createDatabaseSource: (data: { code: string; name?: string; engine?: "postgres" | "redshift" }) =>
    requestWithBody<{ source: DataSource; checks: DataSourceCheck[] }, { checks: DataSourceCheck[] }>(
      "/api/data-sources/database",
      { method: "POST", body: JSON.stringify(data) },
    ),
  listDataSourceActivity: (limit = 50, before?: string, filter: DataSourceActivityFilter = {}) =>
    request<{ events: DataSourceActivityEvent[]; next?: string | null }>(
      `/api/data-sources/activity${qs({ limit, before, ...filter })}`,
    ),

  // E2E test intelligence
  getTestSettings: () => request<TestSettings>("/api/tests/settings"),
  updateTestSettings: (settings: TestSettings) =>
    request<TestSettings>("/api/tests/settings", { method: "PUT", body: JSON.stringify(settings) }),
  getTestSummary: (repo?: string) => request<TestSummary>(`/api/tests/summary${qs({ repo })}`),
  /** Each tracked repo's CI setup: what is in the workflow, what has arrived, the setup PR. */
  getTestSetup: (opts: { repo?: string; refresh?: boolean } = {}) =>
    request<{ repos: TestRepoSetup[]; github: boolean }>(
      `/api/tests/setup${qs({ repo: opts.repo, refresh: opts.refresh ? "1" : undefined })}`,
    ),
  /** The exact change a setup PR would hold. Nothing is written. */
  previewTestSetup: (body: TestSetupAsk) =>
    request<TestSetupPreview>("/api/tests/setup/preview", { method: "POST", body: JSON.stringify(body) }),
  openTestSetupPr: (body: TestSetupAsk) =>
    request<{ pr: TestSetupPr }>("/api/tests/setup/pr", { method: "POST", body: JSON.stringify(body) }),
  listTestRuns: (opts: { repo?: string; branch?: string; pr?: number; before?: string; limit?: number } = {}) =>
    request<{ runs: TestRun[]; next?: string | null }>(`/api/tests/runs${qs(opts)}`),
  getTestRun: (runKey: string) =>
    request<{ run: TestRun; executions: TestRunExecution[] }>(`/api/tests/runs/${encodeURIComponent(runKey)}`),
  listTests: (opts: { repo?: string; state?: TestState; q?: string; sort?: TestSort; before?: string; limit?: number } = {}) =>
    request<{ tests: TestCase[]; next?: string | null }>(`/api/tests${qs(opts)}`),
  getTest: (id: string) =>
    request<{ test: TestCase; history: TestHistoryRun[]; events: TestStateEvent[] }>(`/api/tests/${encodeURIComponent(id)}`),
  quarantineTest: (id: string, on: boolean, reason?: string) =>
    request<{ test: TestCase }>(`/api/tests/${encodeURIComponent(id)}/quarantine`, {
      method: "POST",
      body: JSON.stringify({ on, reason }),
    }),
  pinTest: (id: string, neverQuarantine: boolean) =>
    request<{ test: TestCase }>(`/api/tests/${encodeURIComponent(id)}/pin`, {
      method: "POST",
      body: JSON.stringify({ never_quarantine: neverQuarantine }),
    }),
  fixTest: (id: string) =>
    request<{ queued: boolean }>(`/api/tests/${encodeURIComponent(id)}/fix`, { method: "POST", body: "{}" }),
  listFailureGroups: (repo?: string) => request<{ groups: FailureGroup[] }>(`/api/tests/failure-groups${qs({ repo })}`),
  getTestCoverage: (repo?: string) =>
    request<{ areas: CoverageArea[]; recommendations: TestRecommendation[] }>(`/api/tests/coverage${qs({ repo })}`),
  acceptTestRecommendation: (id: string) =>
    request<{ queued: boolean }>(`/api/tests/recommendations/${encodeURIComponent(id)}/accept`, { method: "POST", body: "{}" }),
  dismissTestRecommendation: (id: string, reason?: string) =>
    request<{ ok: boolean }>(`/api/tests/recommendations/${encodeURIComponent(id)}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

/** A query string from the set values only, e.g. `?repo=a%2Fb&limit=50`. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export interface Release {
  repo: string;
  tag: string;
  prev_tag: string;
  pr_count: number;
  headline: string;
  entry_md: string;
  github_release_md: string;
  unclear: string;
  github_release_url: string;
  confluence_url: string;
  email_sent_at: string;
  updated_at: string;
  /** The latest failed run's error (cleared once a run finishes). */
  last_error?: string;
  failed_at?: string;
}

/** A release waiting out the repo's batch window. */
export interface WaitingRelease {
  repo: string;
  /** Unix seconds. */
  fires_at: number;
  merges: number;
  base_branch: string;
}

/** A release tag Coderhelm couldn't cut after its retries. */
export interface BlockedRelease {
  repo: string;
  error: string;
  failed_at: string;
  attempts: number;
  base_branch: string;
}

/** Where a repo's code graph is: turned off, not built yet, queued,
 * indexing, ready, or failed (with `reason`). */
export type GraphState = "off" | "not_built" | "queued" | "indexing" | "ready" | "failed";

export interface GraphRepo {
  repo: string;
  graph_enabled: boolean;
  /** Missing from an older gateway: read from `graph_enabled`/`indexed`. */
  state?: GraphState;
  /** Why the last build failed. */
  reason?: string;
  /** A built graph is being rebuilt or updated. */
  updating?: boolean;
  indexed: boolean;
  files: number;
  symbols: number;
  branch: string;
  indexed_sha: string;
  updated_at: string;
}

export interface GraphTopFile {
  path: string;
  rank: number;
  defs: number;
}

export interface GraphStatus {
  indexed: boolean;
  files?: number;
  symbols?: number;
  names_referenced?: number;
  branch?: string;
  indexed_sha?: string;
  updated_at?: string;
  top_files?: GraphTopFile[];
}

export interface GraphSymbolDef {
  name: string;
  path: string;
  kind: string;
  line: number;
  rank: number;
}

export interface GraphSymbolResult {
  definitions: GraphSymbolDef[];
  callers: string[];
}

export interface GraphNeighborhood {
  path: string;
  imports: string[];
  importers: string[];
  symbols: { name: string; callers: string[] }[];
}

export interface ReviewerConfig {
  enabled: boolean;
  label: string;
  killed: boolean;
  instructions: string;
  auto_merge: boolean;
  merge_method: string;
  require_human_approval: boolean;
  auto_tag: boolean;
  tag_mode: string;
  tag_prefix: string;
  tag_batch_minutes: number;
  health_check: boolean;
  verify_tests: boolean;
  /** New or changed behavior must come with new/updated tests (blocking finding). */
  require_tests: boolean;
  /** Reviewer picks CI labels (e.g. E2E areas, staging deploy) from what the PR changes. */
  auto_labels: boolean;
  /** Labels it may add: exact names or PREFIX*, comma-separated. */
  auto_label_allow: string;
  /** One rule per line: `pattern -> companion, companion`. */
  auto_label_requires: string;
  /** When to use which label (free text for the reviewer). */
  auto_label_guide: string;
  /** Write + publish release notes when Coderhelm cuts a release tag. */
  release_notes: boolean;
  /** Only tags on this branch get notes; empty = the default branch. */
  release_notes_branch: string;
  release_notes_confluence_space: string;
  /** Confluence page id the changelog lives under; empty = no Confluence step. */
  release_notes_confluence_parent_id: string;
  release_notes_confluence_container: string;
  /** HTTPS webhook that emails the notes (e.g. Atlassian Automation); empty = no email. */
  release_notes_email_webhook_url: string;
  /** Write-only: sent as X-Automation-Webhook-Token. Empty on save = keep the stored one. */
  release_notes_email_webhook_secret?: string;
  /** Read-only: whether a secret is stored. */
  release_notes_email_webhook_secret_set?: boolean;
  /** Set true on save to remove the stored secret. */
  release_notes_email_webhook_secret_clear?: boolean;
  /** Repo path of the writing guide; empty = auto-detect. */
  release_notes_guide: string;
  release_notes_instructions: string;
  deploy_label: string;
  health_log_groups: string[];
  reminders_enabled: boolean;
  /** Where reminders and release notes failures post. Read only: shown as a hint. */
  webhooks?: WebhooksView;
  reminder_cooldown_hours: number;
}

export interface ReviewRatingComment {
  by: string;
  text: string;
  rating?: string;
  at: string;
}

export interface Review {
  sk: string;
  repo: string;
  pr_number: number;
  head_sha: string;
  verdict: string;
  risk: string;
  body: string;
  posted_as: string;
  trigger: string;
  action_summary: string;
  thumbs_up: number;
  thumbs_down: number;
  rating_comments: ReviewRatingComment[];
  created_at: string;
  /** Team standards the review was given in full ("Always apply"). */
  applied_standards?: string[];
  /** The PR's title when the review was written (empty on older reviews). */
  pr_title?: string;
  /** The findings, one object each (null on older reviews: read them from `body`). */
  findings?: ReviewFinding[] | null;
}

/** One finding of a review, as the reviewer kept it. */
export interface ReviewFinding {
  /** blocking · high · medium · low · nit */
  severity: string;
  /** What it rests on: defect · concern · question. */
  kind?: string;
  /** It holds the merge (the verdict requests changes for it). */
  blocks?: boolean;
  file: string;
  line: number;
  title: string;
  body: string;
}

/** One line of the auto-merge checklist ("CI green", "Waiting for a person's approval"). */
export interface MergeChecklistLine {
  mark: "done" | "waiting" | "blocked";
  text: string;
}

/**
 * One PR the reviewer handles, with the one status it shows. Every field past
 * the key may be missing (older backends, records written before a field existed).
 */
export interface LivePr {
  repo: string;
  pr_number: number;
  pr_title?: string;
  /** reviewing · queued · retrying · waiting_ci · ci_failing · waiting_people · merge_blocked · paused · failed · stalled · merged · closed · new_commits · skipped · reviewed */
  status?: string;
  /** active (being reviewed or queued) · waiting · done */
  group?: "active" | "waiting" | "done" | string;
  updated_at?: string;
  review?: {
    phase?: string;
    kind?: "review" | "question" | string;
    trigger?: string;
    head_sha?: string;
    attempt?: number;
    reason?: string;
    queued_at?: string;
    started_at?: string;
    finished_at?: string;
  } | null;
  gate?: {
    state?: string;
    detail?: string;
    head_sha?: string;
    armed_at?: string;
    checklist?: MergeChecklistLine[];
    stopped?: GateStop | null;
  } | null;
}

/** A person's stop of auto-merge. `by` is a GitHub login when `is_login`, else the user's email. */
export interface GateStop {
  by: string;
  is_login?: boolean;
  /** comment · dashboard */
  via: string;
  at: string;
}

/** One stop or re-arm in a gate's audit log. */
export interface GateControlEntry {
  /** stop · rearm */
  action: string;
  by: string;
  is_login?: boolean;
  via: string;
  at: string;
  /** stopped · rearmed · recheck */
  outcome?: string;
}

export type GateAction = "stop" | "rearm";

/** GET /api/reviewer/gate: one PR's auto-merge gate. */
export interface GateDetail {
  repo: string;
  pr_number: number;
  pr_title?: string;
  auto_merge: boolean;
  status?: string;
  group?: string;
  can_control?: boolean;
  gate: {
    state?: string;
    detail?: string;
    head_sha?: string;
    armed_at?: string;
    updated_at?: string;
    checklist?: MergeChecklistLine[];
    stopped?: GateStop | null;
    /** Newest first. */
    controls?: GateControlEntry[];
  } | null;
}

export interface GateControlResult {
  /** stopped · already_stopped · rearmed · rechecking · finished · off */
  status: string;
  ok: boolean;
  message: string;
}

export interface TeamUser {
  user_id: string;
  email: string | null;
  github_login: string | null;
  avatar_url: string | null;
  role: string;
  name: string | null;
  status?: string;
  updated_at: string | null;
}

export interface Run {
  run_id: string;
  status: string;
  ticket_source?: string;
  ticket_id: string;
  title: string;
  repo: string;
  pr_url?: string;
  pr_number?: number;
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
  duration_s?: number;
  created_at: string;
  current_pass?: string;
}

export interface CloseRunRequest {
  /** A preset ("Not needed", "Duplicate", …) and the optional note, as one line. */
  reason?: string;
  /** Also close the run's pull request on GitHub, with a comment. */
  close_pr?: boolean;
}

export interface CloseResult {
  run_id: string;
  outcome: "closed" | "already_closed" | "refused" | "not_found" | "failed";
  /** For a person to read. */
  message: string;
  prs_closed?: number[];
  prs_not_closed?: number[];
}

export interface BulkCloseAnswer {
  results: CloseResult[];
  closed: number;
  already_closed: number;
  failed: number;
}

export interface RunDetail extends Run {
  /** Why an agent loop stopped (agents paused, an approval nobody answered). */
  policy_note?: string | null;
  policy_approval?: string | null;
  /** Connections the run could have used, with a way to connect. */
  sign_in_prompts?: import("@/lib/agent-policy").SignInPrompt[];
  ticket_source?: string;
  branch?: string;
  pr_number?: number;
  pr_urls?: string[];
  pr_numbers?: number[];
  branches?: string[];
  files_modified?: string[];
  mcp_servers?: string[];
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  error?: string;
  updated_at?: string;
  pass_history?: { pass: string; started_at: string }[];
  /** Team standards the run's passes were given in full ("Always apply"). */
  applied_standards?: string[];
  progress_notes?: { message: string; timestamp: string }[];
  /** Where the planner decided the fix belongs: code, outside_code, both or unknown. */
  fix_location?: string | null;
  /** Markdown report when the fix is (partly) a change outside the code. */
  outside_change_report?: string | null;
  /** The lesson saved for the repository when people said the fix was elsewhere. */
  lesson?: string | null;
  /** Who closed the run on purpose (their name, login or email), when and why. */
  closed_by?: string | null;
  closed_at?: string | null;
  close_reason?: string | null;
  /** The status it had when it was closed. */
  closed_from?: string | null;
}

export interface PassTrace {
  pass: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  error?: string;
  timestamp: string;
  cost_usd?: number;
  /** What the step did, for steps that keep it (a team agents' review: its step, each review, whether the draft was revised). */
  detail?: unknown;
}

export interface Openspec {
  proposal?: string;
  design?: string;
  tasks?: string;
  spec?: string;
}

export interface AgentLogTurn {
  turn: number;
  role: string;
  content: unknown[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read: number;
    cache_write: number;
  };
  stop_reason?: string;
}

export interface AgentLogPass {
  pass: string;
  conversation: AgentLogTurn[];
}

export interface SearchResults {
  q: string;
  runs: { run_id: string; title: string; ticket_id: string; repo: string; status: string; created_at: string }[];
  reviews: { sk: string; repo: string; pr_number: number; title: string; verdict: string; created_at: string }[];
  releases: { repo: string; tag: string; headline: string; updated_at: string }[];
  plans: { plan_id: string; title: string; repo: string; status: string; created_at: string }[];
}

/** An open pull request, for the "Review a PR" picker. */
export interface OpenPr {
  number: number;
  title: string;
  author: string;
  draft: boolean;
  updated_at: string;
}

export interface Repo {
  name: string;
  enabled: boolean;
  ticket_source: string;
  onboard_status?: "pending" | "ready" | "failed";
  onboard_error?: string;
  /** Human-assigned role used to disambiguate Jira ticket routing. */
  role?: string;
}

export interface Stats {
  total_runs: number;
  completed: number;
  failed: number;
  in_progress: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  merge_rate: number;
  /** Calls whose reply broke off, so their output tokens are an estimate. Missing on older servers. */
  estimated_calls?: number;
  /** Calls whose usage was written later, from the fallback queue. Missing on older servers. */
  recovered_calls?: number;
}

/**
 * The last run of the daily usage check. `off`: no Anthropic admin key is set
 * (`secret` names where it goes); `ran`: `teams` teams compared for `day`;
 * `never`: it hasn't run since it was deployed.
 */
export interface UsageCheck {
  state: "off" | "ran" | "never";
  checked_at?: string | null;
  secret?: string | null;
  day?: string | null;
  teams?: number;
  /** Models whose recorded usage differed from the report by more than the drift limit. */
  flagged_models?: number;
  /** Teams whose report couldn't be read. */
  failed_teams?: number;
}

export interface MonthStats {
  period: string;
  total_runs: number;
  completed: number;
  failed: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
}

/** One person's email choices. Every field defaults to on. */
export interface NotificationPrefs {
  email_token_warning: boolean;
  email_weekly_summary: boolean;
  email_run_complete?: boolean;
  email_run_failed?: boolean;
}

/** The team's templates; an empty one keeps Coderhelm's default. */
export interface GitConventionTemplates {
  branch: string;
  commit: string;
  pr_title: string;
}

export interface GitConventions extends GitConventionTemplates {
  defaults: GitConventionTemplates;
  tokens: string[];
}

export interface WorkflowSettings {
  commit_openspec: boolean;
  default_destination: "github" | "jira";
  allow_plan_log_analyzer: boolean;
}

/** One feature's share of the month (all four parts). */
export interface FeatureUsage {
  feature: string;
  total_tokens: number;
  tokens_in: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  tokens_out: number;
}

export interface UsageInfo {
  month: string;
  /** All four parts: new input + read from cache + written to cache + output. */
  total_tokens: number;
  /** New input (not read from or written to the cache). */
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  /** Read from cache ÷ (read from cache + written to cache + new input). */
  cache_hit_rate?: number;
  /** New input + output: what the new tokens limit counts. */
  new_tokens?: number;
  /** Each limit that is set, with what it counts this month. */
  limits?: TokenLimitUse[];
  /** True while the team still has the old single limit. */
  limits_legacy?: boolean;
  /** Old single limit only: what it compares with max_tokens. */
  counted_tokens?: number;
  /** Old single limit only: whether it counts cache tokens too. */
  limit_counts_cache?: boolean;
  features?: FeatureUsage[];
  total_runs: number;
  /** The old single limit (0 once the three limits are saved). */
  max_tokens: number;
}

/**
 * Which tokens a limit counts: new input + output, cache reads, cache writes,
 * or (an old single limit that counts cache too) all four kinds.
 */
export type TokenLimitKind = "new_tokens" | "cache_read" | "cache_write" | "all_tokens";

export interface TokenLimitUse {
  kind: TokenLimitKind;
  /** The monthly limit, in tokens. */
  max: number;
  /** What it counts so far this month. */
  used: number;
}

/** The three monthly limits; null (or 0) means no limit of that kind. */
export interface TokenLimitsInput {
  max_new_tokens: number | null;
  max_cache_read_tokens: number | null;
  max_cache_write_tokens: number | null;
}

/** GET /api/settings/budget: each limit (0 = none), plus the old single limit. */
export interface BudgetInfo {
  max_new_tokens: number;
  max_cache_read_tokens: number;
  max_cache_write_tokens: number;
  legacy: boolean;
  max_tokens: number;
  limit_counts_cache: boolean;
}

export interface ModelProviderConfig {
  provider: "anthropic";
  api_key_masked: string | null;
  primary_model: string | null;
  heavy_model: string | null;
  /** How this install calls Claude: "bedrock" needs no team key. */
  deployment_provider?: "anthropic" | "bedrock";
}

export interface Banner {
  id: string;
  message: string;
  type: "info" | "warning" | "error";
  dismissible: boolean;
  link_text?: string;
  link_url?: string;
}

export interface TeamInfo {
  team_id: string;
  org: string;
  status: string;
  current: boolean;
}

export interface Plan {
  plan_id: string;
  title: string;
  description: string;
  repo: string;
  destination?: "github" | "jira" | string;
  status: "draft" | "executing" | "waiting" | "done" | string;
  task_count: number;
  tokens_in?: number;
  tokens_out?: number;
  mcp_servers?: string[];
  /** The plan chat it was made in, for what that chat used. */
  chat_id?: string;
  created_at: string;
  updated_at: string;
  executed_at?: string;
  executed_by?: string;
  tasks?: Task[];
}

export interface Task {
  task_id: string;
  plan_id: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  status:
    | "draft"
    | "approved"
    | "rejected"
    | "queued"
    | "running"
    | "done"
    | "waiting"
    | "failed"
    | string;
  order: number;
  repo?: string;
  depends_on?: string;
  destination?: "github" | "jira" | string;
  jira_project?: string;
  issue_number?: number;
  issue_url?: string;
  jira_ticket_key?: string;
  jira_ticket_url?: string;
  run_id?: string;
  pr_url?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  created_at: string;
}

export interface TaskTemplate {
  title: string;
  description: string;
  acceptance_criteria: string;
  repo?: string;
  order: number;
}

export interface Template {
  template_id: string;
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  task_templates?: TaskTemplate[];
  task_count: number;
  usage_count: number;
  created_by: string;
  created_at: string;
}

export interface InfraFinding {
  severity: "error" | "warning" | "info";
  category: "security" | "performance" | "cost" | "reliability";
  title: string;
  detail: string;
  file?: string;
}

export interface InfraAnalysis {
  status: "pending" | "ready" | "no_infra" | "failed";
  has_infra: boolean;
  diagram?: string;
  diagram_title?: string;
  findings?: InfraFinding[];
  suggested_prompt?: string;
  cached_at?: string;
  scanned_repos?: string[];
  error?: string;
}

export interface HealthCheckItem {
  name: string;
  status: "ok" | "warning" | "critical";
  count?: number;
  /** Failed messages: when the team's oldest was first sent, and its age. */
  oldest_sent_at?: string | null;
  oldest_age_secs?: number | null;
  /** Failed messages: the team's messages that can never be retried. */
  unretryable?: number;
  visible?: number;
  in_flight?: number;
  items?: {
    run_id?: string;
    title?: string;
    status?: string;
    error?: string;
    created_at?: string;
  }[];
}

export interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  checked_at: string;
  checks: HealthCheckItem[];
}

export interface DlqMessage {
  message_id: string;
  /** The message's type tag, as stored (null when it has none). */
  type: string | null;
  sent_at: string | null;
  age_secs: number | null;
  /** The queue it failed on, by name. */
  source_queue: string;
  /** False when sending it again can only fail: the worker can't read it. */
  retryable: boolean;
  /** Why it can't be retried, e.g. "unknown message type `SkillSync`". */
  problem: string | null;
  /** The stored body: parsed JSON, or the raw text when it isn't JSON. */
  body: unknown;
}

export interface DlqList {
  messages: DlqMessage[];
  /** The team's failed messages that can be retried (its Problem). */
  count: number;
  /** The team's messages that can't be retried. */
  unretryable: number;
  complete: boolean;
}

export interface AdminDlqMessage extends DlqMessage {
  team_id: string | null;
  global: boolean;
  /** Counts for no team: unreadable, a global job, or no team at all. */
  shared_only: boolean;
}

export interface AdminDlqList {
  messages: AdminDlqMessage[];
  /** An older gateway leaves the counts and retention fields out. */
  count?: number;
  shared?: number;
  unreadable?: number;
  complete: boolean;
  cleanup_after_days?: number;
  retention_days?: number;
}

export interface JiraCheck {
  ready: boolean;
  secret_configured: boolean;
  configured_repos: { total: number; enabled: number };
  enabled_repos: string[];
  jira_events_seen: boolean;
  last_jira_event_at?: string;
  jira_event_count?: number;
  installation_id: number;
  team_id: string;
  webhook_url?: string;
  forge_secret?: string;
}

export interface JiraEvent {
  event_id: string;
  event_type: string;
  ticket_key: string;
  title: string;
  status: string;
  repo: string;
  created_at: string;
}

export interface JiraConfig {
  default_project: string;
  trigger_label: string;
  list_projects_url: string;
  create_ticket_url: string;
  add_comment_url: string;
  site_url: string;
  projects: JiraProject[];
}

export interface JiraProject {
  key: string;
  name: string;
  enabled: boolean;
  repo?: string;
  lead?: string | null;
  style?: string;
}

/** One rule on an alert route: the alerts it takes open a PR in `repo`. */
export interface AlertRule {
  /** Kept across saves so the rule's daily cap carries over. */
  id?: string;
  /** CloudWatch alarm names this rule takes. */
  alarms: string[];
  /** Or: alerts whose text contains any of these. */
  terms: string[];
  repo: string;
  instructions: string;
}

export interface AlertRoute {
  topic_arn: string;
  /** First matching rule opens a PR; alerts no rule takes only post to chat. */
  rules: AlertRule[];
  enabled: boolean;
  /** Chat notifications: the team channels, the route's own channels, or none. */
  notify_mode?: "team" | "custom" | "off";
  /** The route's own webhooks (custom), shown only as a hint. */
  webhooks?: WebhooksView;
  /** Post recoveries (one per open alert message) and other non-alarm state changes. Off by default. */
  post_recoveries?: boolean;
  updated_at?: string;
}

/** The team's daily spending limit for alert runs, and the last 24 hours' spend. */
export interface AlertBudget {
  /** Most tokens (input + output) alert runs may use per rolling day. */
  daily_tokens: number;
  used_24h_tokens: number;
  open_runs: number;
  /** Tokens counted for each run still in progress. */
  open_run_reserve_tokens: number;
  max_runs_per_rule_per_day: number;
}

/** A CloudWatch alarm whose ALARM action publishes to a route's topic. */
export interface TopicAlarm {
  name: string;
  state?: string | null;
  description?: string | null;
  metric?: string | null;
}

export interface AlertNotifySettings {
  enabled: boolean;
  webhooks: WebhooksView;
}

/** A chat channel Coderhelm posts to. */
export type ChatChannel = "teams" | "slack";

/** A saved webhook, as the API shows it: never the URL, only whether one is set and a hint. */
export interface WebhookView {
  set: boolean;
  hint: string;
}
export type WebhooksView = Record<ChatChannel, WebhookView>;

/** A change to one saved webhook: a new URL, or clear it. Omitted = keep. */
export interface WebhookInput {
  url?: string;
  clear?: boolean;
}
export interface ChannelsInput {
  teams_webhook?: WebhookInput;
  slack_webhook?: WebhookInput;
}

/** Whose saved webhook a test message uses (and which sample it posts). */
export type NotifyDestination =
  | { destination: "alerts" }
  | { destination: "route"; topic_arn: string }
  | { destination: "recommendations" }
  | { destination: "reviewer"; repo: string };

/** One alert Coderhelm received, and what it did with it. */
export interface AlertEvent {
  id: string;
  received_at?: string | null;
  topic_arn?: string | null;
  repo?: string | null;
  kind?: string | null;
  title?: string | null;
  outcome: string;
  ticket_id?: string | null;
  /** For a recovery: the ticket of the alert it resolves (newer events only). */
  recovers_ticket?: string | null;
}

export interface AlertEventDetail {
  alert: AlertEvent & { body?: string | null };
  runs: {
    run_id: string;
    status?: string | null;
    title?: string | null;
    pr_url?: string | null;
    created_at?: string | null;
  }[];
}

/** Base URL of the Coderhelm API (shown to users who subscribe endpoints). */
/** The API base for fetch calls ("" means this hostname). */
export const apiBaseUrl = apiBase;

export interface AwsConnection {
  connection_id: string;
  role_arn: string;
  external_id?: string | null;
  region: string;
  status: string;
  /** The last failed analysis or test, if the latest one failed. */
  error_message?: string;
  last_error_at?: string;
  last_analyzed_at?: string;
  log_groups: string[];
  created_at?: string;
  updated_at?: string;
  /** What the role can do (logs, metrics, Airflow); null for an unreadable record. */
  abilities?: AwsAccountAbilities | null;
}

export interface LogGroup {
  name: string;
  stored_bytes?: number;
  retention_days?: number;
}

export interface Recommendation {
  rec_id: string;
  status: "pending" | "approved" | "dismissed";
  severity: "critical" | "warning" | "info";
  title: string;
  summary: string;
  suggested_action: string;
  source_log_group?: string;
  source_account_id?: string;
  error_pattern?: string;
  error_hash?: string;
  error_count?: number;
  plan_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type LogSeverity = "critical" | "warning" | "info";
export type LogFindingStatus = "new" | "acknowledged" | "fixing" | "fixed" | "ignored";

/** One finding on the Logs page (`GET /api/log-findings`). */
export interface LogFinding {
  rec_id: string;
  title: string;
  summary: string;
  suggested_action: string;
  severity: LogSeverity;
  status: LogFindingStatus;
  log_group: string;
  account_id: string;
  error_pattern: string;
  /** Matching lines in its log group in the analysis that last saw it. */
  error_count?: number | null;
  /** Matching lines in its log group over every analysis (null on findings
   *  stored before lines were counted). */
  seen_count?: number | null;
  /** The first matching line's own time; never moves forward. */
  first_seen: string;
  /** The last matching line's own time. */
  last_seen: string;
  suspected_location?: string | null;
  plan_id?: string | null;
  /** The repo its fix went to, or the one mapped to its log group. */
  repo?: string | null;
  repo_mapped: boolean;
  console_url?: string | null;
  fix?: {
    state: "none" | "starting" | "running" | "pr_open" | "merged" | "pr_closed" | "failed";
    ticket_id: string;
    run_id?: string | null;
    run_status?: string | null;
    pr_number?: number | null;
    pr_url?: string | null;
    auto: boolean;
    started_at: string;
  } | null;
  /** What the automatic sweep decided, when it looked at it. */
  auto?: { status: "started" | "skipped" | "waiting"; reason: string } | null;
}

/** Which repo a log group's (or alarm's) code lives in, how sure, and why. */
export interface RepoResolution {
  repo: string | null;
  confidence: "high" | "medium" | "low" | "none";
  /** `saved`: a mapping someone saved; `resolved`: worked out from the evidence. */
  source: "saved" | "resolved";
  /** One sentence shown under the repo. */
  reason: string;
  decided_by: { kind: string; detail: string }[];
  /** Best first when a person should check. */
  candidates: { repo: string; reason: string }[];
  /** AWS permissions that would let Coderhelm see more. */
  permissions: string[];
  resolved_at: string;
  cached: boolean;
  /** The repo saved for the log group, when the evidence was weighed against it. */
  saved?: string | null;
}

export interface LogFindingsList {
  findings: LogFinding[];
  counts: Record<LogFindingStatus, number>;
  log_groups: string[];
  aws_connected: boolean;
}

export interface LogSample {
  timestamp: string;
  message: string;
}

/** The team's automatic fix PR setting. Off by default. */
export interface LogAutofix {
  enabled: boolean;
  min_severity: LogSeverity;
  daily_cap: number;
  /** "all": every log group with a repo; "listed": only groups turned on below. */
  scope: "all" | "listed";
  /** UTC hours. */
  quiet_hours: { start_hour: number; end_hour: number } | null;
  overrides: { log_group: string; repo: string; auto: boolean | null; min_severity: LogSeverity | null }[];
  /** Set by the server when it is turned on. */
  enabled_at?: string;
}

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  icon: string;
  credential_fields: CredentialField[];
  docs_url: string;
  repo_url: string;
  default_prompt: string;
  recommended_permissions: string;
  /** The vendor's own remote server, signed in to with OAuth; empty when it runs none. */
  remote_url?: string;
}

export interface EnabledPlugin {
  plugin_id: string;
  enabled: boolean;
  has_credentials: boolean;
  enabled_at: string | null;
  custom_prompt: string | null;
}

export interface MemoryOrigin {
  /** "run" (learned on a ticket) or "person" (someone added it). */
  source: string;
  run_id?: string;
  ticket_id?: string;
  title?: string;
  added_by?: string;
  edited_by?: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  memory_type: string;
  tags: string[];
  confidence: number;
  created_at: number;
  accessed_at: number;
  access_count: number;
  topic?: string;
  topic_label?: string;
  pinned?: boolean;
  origin?: MemoryOrigin;
  uses?: number;
  last_used?: { at: string; run_id: string; title: string } | null;
}

export interface MemoryFilters {
  source?: "run" | "person";
  topic?: string;
  pinned?: boolean;
  sort?: "newest" | "most_used";
}

export interface MemoryPreview {
  pinned: MemoryItem[];
  recalled: { memory: MemoryItem; score: number }[];
}

export interface AgentProfile {
  id: "reviewer" | "planner" | "coder" | "feedback";
  name: string;
  role: string;
  uses_repo_memory: boolean;
  knows: { label: string; detail: string }[];
  learned: { text: string; source: string; at: string; link?: string | null }[];
  activity_label: string;
  activity_count: number;
  recent: { title: string; at: string; outcome: string; link?: string | null }[];
}

export interface MemoryListResponse {
  memories: MemoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemoryStats {
  total: number;
  by_type: Record<string, number>;
}

// Data sources
export type DataSourceKind = "api" | "logs" | "database" | "rest" | "search";

/** Where in a team's AWS account a logs or database source reads. */
export interface DataSourceAws {
  account: string;
  region: string;
  role_arn: string;
  log_groups: string[];
  /** Database cluster or Redshift warehouse name, "" for logs. */
  cluster: string;
  database: string;
  /** "redshift" for a data warehouse; PostgreSQL otherwise. */
  engine?: "postgres" | "redshift";
  /** Redshift: every database the team shared. */
  databases?: string[];
}

export interface DataSource {
  id: string;
  kind: DataSourceKind;
  /** Set for logs and database sources, null for an API. */
  aws?: DataSourceAws | null;
  name: string;
  /** The API's address. Empty for logs and databases. */
  url: string;
  status: "ready" | "error";
  status_message?: string;
  enabled: boolean;
  /** True from the first time the source is turned on. The reviewer uses a source only when it is enabled and its status is "ready". */
  setup_complete: boolean;
  /** Last four characters of the key, or "" for a very short key. */
  key_hint: string;
  has_mutations: boolean;
  /** API: kinds of data. Logs: shared log groups. Database: tables. */
  kinds: number | null;
  schema_available: boolean;
  hidden_fields: string[];
  /** Empty means all repositories. */
  repos: string[];
  last_checked_at: string;
  created_at: string;
  created_by: string;
  /** REST: the header the key is sent in. */
  header_name?: string;
  /** REST: path prefixes agents may GET. */
  paths?: string[];
  /** Search: the cluster user. */
  user?: string;
  /** Search: indexes agents may read; empty for every index the user sees. */
  indexes?: string[];
  /** What agents should know when using it. */
  instructions?: string;
}

/** What a REST API or OpenSearch cluster is set up with. */
export interface DataSourceReaderSettings {
  url?: string;
  header_name?: string;
  paths?: string[];
  user?: string;
  indexes?: string[];
}

export type DataSourceStepId = "reach" | "sign_in" | "read" | "read_only" | "role" | "logs";

export interface DataSourceCheck {
  id: DataSourceStepId;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export interface DataSourceStepError {
  /** A step id (see DataSourceStepId). Show its label, never the id. */
  step: string;
  message: string;
  fix: string;
}

export interface DataSourceProbe {
  ok: boolean;
  kind: "graphql" | null;
  needs_key: boolean;
  error?: DataSourceStepError;
}

export interface DataSourceCheckResult {
  ok: boolean;
  checks: DataSourceCheck[];
  kinds: number | null;
  has_mutations: boolean;
  schema_available: boolean;
}

export interface DataSourceSample {
  label: string;
  query: string;
  /** Logs samples name the groups and time range they search. */
  log_groups?: string[];
  since?: string;
  /** Warehouse samples name the database they read. */
  database?: string | null;
}

/** How Coderhelm reaches a team's AWS account: the line the setup script printed, or a role it already uses. */
export type AwsAccess = { code: string } | { role_arn: string; region: string };

export interface AwsExistingConnection {
  role_arn: string;
  account: string;
  region: string;
  log_groups: string[];
}

export interface AwsSetup {
  script: string;
  existing: AwsExistingConnection[];
  role_prefix: string;
}

export interface AwsLogGroup {
  name: string;
  stored_mb: number;
  retention_days: number | null;
}

export interface AwsConnectResult {
  ok: boolean;
  checks: DataSourceCheck[];
  account?: string;
  region?: string;
  role_arn?: string;
  log_groups?: AwsLogGroup[];
  database?: { cluster: string; database: string } | null;
  /** A Redshift warehouse the pasted line includes, with its shared databases. */
  warehouse?: { cluster: string; databases: string[] } | null;
}

export interface DataSourceTryResult {
  ok: boolean;
  query: string;
  fields: string[];
  result?: string;
  hidden_count: number;
  ms: number;
  /** Why the lookup was refused, including what to do. */
  refused?: string;
  error?: DataSourceStepError;
  /** A short summary, like "12 rows" or "40 lines, 3.2 MB scanned". */
  note?: string;
}

/** A column a source's table and column names suggest holds a person's details. */
export interface HiddenSuggestion {
  /** `schema.table.column`, the form the hidden list takes. */
  entry: string;
  reason: string;
}

export interface HiddenSuggestions {
  suggestions: HiddenSuggestion[];
  dismissed: string[];
  /** When they were last worked out; empty before the first time. */
  checked_at?: string;
}

export interface DataSourceActivityEvent {
  at: string;
  source_id: string;
  source_name: string;
  /** The literal string "reviewer" for a review, otherwise a person's email. */
  actor: string;
  repo?: string;
  pr?: number;
  summary: string;
  /** The full lookup text as recorded. Older servers send only `summary`. */
  query?: string;
  /** Opaque position of this lookup, for paging further back with `before`. */
  cursor?: string;
  /** For a lookup that worked, a short note like "12 rows"; otherwise why it was refused or failed. */
  detail?: string;
  ok: boolean;
  /** `unknown_name`: it named a table, column, type or field the source doesn't have, so it wasn't sent. */
  outcome: "ok" | "refused" | "failed" | "unknown_name";
  ms: number;
  /** The run the lookup was made during, for a link to it. */
  run_id?: string;
  /** The work it was made during, e.g. "owner/name#12" or "owner/name · ABC-1". */
  origin?: string;
}

/** What to show of the lookup log. Empty fields match everything. */
export interface DataSourceActivityFilter {
  source?: string;
  /** An outcome, or "problems" for refused and failed. */
  outcome?: string;
  /** An agent ("reviewer", "planner", "coder"), or "people". */
  who?: string;
  q?: string;
  since?: string;
}

// ── Analytics ──────────────────────────────────────────────────────────────

export type AnalyticsDays = 7 | 30 | 90;
/** A number of days, or "mtd": this month so far against the same time elapsed last month. */
export type AnalyticsPeriod = AnalyticsDays | "mtd";

/** How much work there was in one period, each thing counted once. */
export interface AnalyticsCounts {
  /** Distinct tickets the runs worked on. */
  tickets: number;
  /** Every run, reruns included. */
  runs: number;
  /** Distinct PRs Coderhelm's runs opened or pushed to. */
  prs_opened: number;
  prs_merged: number;
  /** Neither merged nor closed yet. */
  prs_open: number;
  /** Distinct PRs with at least one posted review. */
  prs_reviewed: number;
  /** Answers to questions and re-checks that posted nothing are left out. */
  reviews_posted: number;
  approvals: number;
  changes_requested: number;
  /** Posted as a plain comment, without approving or asking for changes. */
  comments: number;
  repos: number;
  people: number;
  /** Runs that recorded who (or what) asked for them. */
  runs_with_requester: number;
}

export interface AnalyticsComparison {
  current: AnalyticsCounts;
  previous: AnalyticsCounts;
  /** All of last month, when comparing month to date. */
  previous_full: AnalyticsCounts | null;
  previous_full_period: { start: string; end: string } | null;
  /** False when a period did not record who asked for nearly every run. */
  people_comparable: boolean;
  /** Running totals by day; the previous values are null past the end of a shorter previous period. */
  daily: {
    offset: number;
    day: string;
    previous_day: string | null;
    tickets: number;
    prs_opened: number;
    prs_reviewed: number;
    previous_tickets: number | null;
    previous_prs_opened: number | null;
    previous_prs_reviewed: number | null;
  }[];
}

export interface AnalyticsSummary {
  runs: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  prs_open: number;
  /** Merged out of opened, 0-1; null with no PRs. */
  merge_rate: number | null;
  failed_runs: number;
  failure_rate: number | null;
  /** Runs a person closed on purpose: not failures. Older backends leave it out. */
  closed_runs?: number;
  cost_usd: number;
  cost_per_run: number | null;
  cost_per_merged_pr: number | null;
  /** Tokens in plus out. */
  tokens?: number;
  tokens_per_run?: number | null;
  tokens_per_merged_pr?: number | null;
  tokens_in: number;
  tokens_out: number;
  median_run_minutes: number | null;
  median_hours_to_merge: number | null;
  /** How many merged PRs have both an open and a merge time. */
  time_to_merge_known: number;
  merged_untouched: number;
  merged_with_edits: number;
  /** How many merged PRs have a known count of people's commits. */
  edits_known: number;
  reviews: number;
}

export interface Analytics {
  /** Days in the period (for month to date, the days so far). */
  days: number;
  basis?: "days" | "month_to_date";
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  daily: { day: string; runs: number; prs_opened: number; merged: number; failed: number; cost_usd: number; tokens?: number; reviews: number }[];
  sources: { source: string; runs: number; prs: number; merged: number; merge_rate: number | null }[];
  repos: { repo: string; runs: number; prs: number; merged: number; failed: number; cost_usd: number; tokens?: number; merge_rate: number | null; reviews: number }[];
  /** One row per person (however Jira, GitHub or the dashboard named them), Coderhelm's own work, and runs that recorded nobody. */
  people: { person: string; kind?: "person" | "coderhelm" | "not_recorded"; runs: number; merged: number }[];
  failures: { reason: string; count: number; last_run_id: string; last_at: string }[];
  ci: {
    /** Runs whose own CI went red (runs red only on base-branch checks are counted apart). */
    runs_with_red_ci: number;
    fixed_by_coderhelm: number;
    /** Green after a Coderhelm fix, out of the red runs that are no longer running. */
    fix_rate: number | null;
    fix_attempts: number;
    fix_commits: number;
    /** Runs red only on checks that also fail on the base branch. */
    red_on_base_runs?: number;
    /** How each red run ended. Missing from older backends. */
    outcomes?: AnalyticsCiOutcomes;
    /** Why Coderhelm left a red PR to a person, most common first. */
    gave_up_reasons?: { reason: string; count: number }[];
  };
  reviews: {
    posted: number; approve: number; request_changes: number; comment: number; questions: number; prs_reviewed: number;
    findings: number; findings_fixed: number; findings_settled_by_person: number; acted_on_rate: number | null;
    outcomes_known_reviews: number; thumbs_up: number; thumbs_down: number;
  };
  lookups: {
    total: number; refused: number; failed: number;
    by_source: { source: string; total: number; refused: number; failed: number }[];
    by_actor: { actor: string; total: number }[];
  };
  steps: { step: string; count: number; tokens_in: number; tokens_out: number; avg_seconds: number }[];
  steps_window_days: number;
  merged_recent: { run_id: string; title: string; repo: string; pr_number: number; pr_url: string; hours_to_merge: number | null; human_commits: number | null }[];
  failed_recent: { run_id: string; title: string; repo: string; reason: string; at: string }[];
  repo_names: string[];
  /** Absent from servers older than the comparison. */
  comparison?: AnalyticsComparison;
}

// ── E2E test intelligence ─────────────────────────────────────────

export type TestState = "healthy" | "flaky" | "broken" | "quarantined" | "fixed";
export type TestSort = "impact" | "flake_rate" | "slowest" | "recent";
export type AttemptStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
export type RunOutcome = "passed" | "failed" | "flaky" | "skipped";
/** How the runs whose CI went red ended up; each red run is in exactly one. */
export interface AnalyticsCiOutcomes {
  green_after_fix: number;
  /** Green without a Coderhelm fix (a person's push, a later run). */
  green_without_fix: number;
  /** Green after a re-run of the failed jobs, with no code change. */
  flaky: number;
  /** Red only on checks that also fail on the base branch. */
  red_on_base: number;
  gave_up: number;
  running: number;
}

export type FixStatus ="reproducing" | "fixing" | "burn_in" | "opened" | "merged" | "failed";
export type CauseLabel =
  | "selector_changed"
  | "missing_wait"
  | "test_data_clash"
  | "environment"
  | "network"
  | "timing"
  | "order_dependence"
  | "animation_loader"
  | "unknown";

export interface TestSettings {
  enabled: boolean;
  auto_quarantine: boolean;
  fix_prs: boolean;
  tickets: "github" | "jira" | "off";
  burn_in: boolean;
  /** Empty means every repo. */
  repos: string[];
  /** Days a test stays quarantined before its owner gets a ticket (1–30). */
  ticket_after_days: number;
}

export type TestRunner = "playwright" | "jest" | "vitest" | "cypress" | "junit";
export type TestSetupStatus = "no_tests" | "needs_setup" | "in_progress" | "waiting" | "nothing_received" | "set_up";
export type TestSetupStepState = "done" | "missing" | "partial" | "unknown" | "unsupported";

export interface TestSetupPr {
  /** queued, reading, opening, open, merged, closed, nothing_to_do or failed */
  status: string;
  kind: "setup" | "repair" | string;
  quarantine: boolean;
  number?: number | null;
  url?: string | null;
  head_sha?: string | null;
  workflow_path: string;
  error?: string | null;
  actor: string;
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
  /** The PR's checks in one word, read live: none, pending, success or failure. */
  ci?: "none" | "pending" | "success" | "failure" | null;
}

export interface TestRepoSetup {
  repo: string;
  default_branch: string;
  status: TestSetupStatus;
  runner: TestRunner | null;
  runners: TestRunner[];
  workflow: { path: string; job_id: string; job_name?: string | null; step_name?: string | null; test_command?: string | null } | null;
  steps: {
    upload: { state: TestSetupStepState; detail: string; paths: string[] };
    reporter: { state: TestSetupStepState; detail: string; file?: string | null };
    quarantine: { state: TestSetupStepState; detail: string };
  };
  results: { last_at: string | null; run_url: string | null; tests: number; empty_runs: number };
  quarantine_fetch: { last_at: string; run_url?: string | null } | null;
  /** Why runs arrive without results, when the step is in place. */
  cause: { text: string; fixable: boolean; last_run_url?: string | null } | null;
  pr: TestSetupPr | null;
  can_auto: { upload: boolean; quarantine: boolean; repair: boolean; why?: string | null };
  snippets: {
    upload: string;
    quarantine: string;
    reporter: { file: string; code: string };
    by_runner?: Partial<Record<TestRunner, { upload: string; reporter: { file: string; code: string } }>>;
  };
  checked_at?: string | null;
  error?: string | null;
}

export interface TestSetupAsk {
  repo: string;
  quarantine?: boolean;
  repair?: boolean;
}

export interface TestSetupPreview {
  repo: string;
  path: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  added: string[];
  notes: string[];
  diff: string;
}

export interface TestSummary {
  repos: string[];
  counts: Record<TestState, number>;
  prs_blocked_7d: number;
  ci_minutes_lost_7d: number;
  prs_rescued_7d: number;
  runs_7d: number;
  pass_rate_7d: number;
  flake_rate_7d: number;
  /** 30 days, oldest first. Rates are 0–1. */
  trend: { day: string; runs: number; pass_rate: number; flake_rate: number }[];
}

export interface TestRun {
  run_key: string;
  repo: string;
  workflow: string;
  run_id: number;
  run_attempt: number;
  branch: string;
  pr?: number | null;
  sha: string;
  event: string;
  framework: string;
  started_at: string;
  duration_ms: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  bad_run: boolean;
  url: string;
  status: "passed" | "failed";
}

export interface TestAttempt {
  retry: number;
  status: AttemptStatus;
  duration_ms: number;
  error?: { message: string; signature: string } | null;
  trace_url?: string | null;
  video_url?: string | null;
  screenshot_url?: string | null;
}

export interface TestRunExecution {
  test_id: string;
  title: string;
  file: string;
  project?: string | null;
  attempts: TestAttempt[];
  outcome: RunOutcome;
}

export interface TestCase {
  id: string;
  repo: string;
  framework: string;
  file: string;
  title: string;
  project?: string | null;
  state: TestState;
  flags: string[];
  owner?: string | null;
  cause?: { label: CauseLabel; evidence: string } | null;
  runs_30d: number;
  fail_rate_30d: number;
  flake_rate_30d: number;
  flips_14d: number;
  prs_blocked_7d: number;
  minutes_lost_7d: number;
  p50_ms: number;
  p95_ms: number;
  last_seen: string;
  quarantined_since?: string | null;
  never_quarantine: boolean;
  ticket_url?: string | null;
  fix_pr_url?: string | null;
  fix_status?: FixStatus | null;
}

export interface TestHistoryRun {
  run_key: string;
  sha: string;
  branch: string;
  pr?: number | null;
  at: string;
  outcome: RunOutcome;
  attempts: TestAttempt[];
}

export interface TestStateEvent {
  at: string;
  from: TestState;
  to: TestState;
  reason: string;
  actor: string;
}

export interface FailureGroup {
  signature: string;
  message: string;
  selector?: string | null;
  step?: string | null;
  tests: number;
  failures_7d: number;
  last_seen: string;
  test_ids: string[];
  cause?: CauseLabel | null;
}

export interface CoverageArea {
  area: string;
  paths: string[];
  tests: { id: string; title: string }[];
  runs_30d: number;
  covered: boolean;
}

export interface TestRecommendation {
  id: string;
  repo: string;
  area?: string | null;
  title: string;
  why: string;
  evidence: { kind: "bug_ticket" | "changed_code" | "route" | "traffic"; text: string; url?: string | null }[];
  status: "open" | "accepted" | "generating" | "pr_opened" | "dismissed";
  pr_url?: string | null;
}

export type ConnectorKind = "newrelic" | "confluence" | "opensearch" | "rest" | "metrics" | "airflow";
/** A connection set up with a key in Settings → Integrations. */
export type KeyConnectorKind = "newrelic" | "confluence" | "opensearch" | "rest";
/** A connection's id in routes: its kind, or `rest:<name>` for one of the team's REST APIs. */
export type ConnectorId = KeyConnectorKind | `rest:${string}`;

/** A monitoring, docs or pipeline connection. Keys are never returned. */
export interface Connector {
  kind: ConnectorKind;
  /** `rest:<name>` for a named REST API, else the kind. */
  id?: string;
  /** A REST API's name (how agents pick it). */
  name?: string;
  label: string;
  connected: boolean;
  /** An empty card for adding one more of a kind that's named per connection. */
  needs_name?: boolean;
  /** What agents should know when using it. */
  instructions?: string;
  enabled?: boolean;
  status?: string;
  status_message?: string;
  key_hint?: string;
  region?: string;
  account_ids?: string[];
  site?: string;
  email?: string;
  spaces?: string[];
  write_enabled?: boolean;
  write_pages?: string[];
  /** Confluence: `jira_app` when it goes through the team's Coderhelm Jira app (no token), else empty. */
  via?: string;
  environments?: string[];
  indexes?: string[];
  hidden_fields?: string[];
  header_name?: string;
  paths?: string[];
  repos?: string[];
  aws?: { account: string; region: string; role: string } | null;
  updated_at?: string;
  updated_by?: string;
}

export type IntegrationStatus = "connected" | "needs_credentials" | "needs_reconnect" | "not_connected" | "error";
export type IntegrationAction = "connect" | "add_credentials" | "reconnect" | "check_again" | "manage";
export type IntegrationSection = "code" | "cloud" | "monitoring" | "docs" | "chat" | "mcp" | "other";

// ── Remote MCP servers ────────────────────────────────────────────

/** How a remote MCP server signs in. */
export type McpAuth = "none" | "header" | "oauth";
export type McpStatus = "not_connected" | "connected" | "needs_reconnect" | "failed";

/** One tool a remote server lists, and whether agents get it. */
export interface McpTool {
  name: string;
  title: string | null;
  description: string;
  /** From the server's own hints; `unknown` when it gives none. */
  access: "read" | "write" | "unknown";
  allowed: boolean;
  /** Approved by a second admin (always, with one admin). */
  approved: boolean;
  /** False when its name can't be offered to a model (too long or unusual). */
  offerable: boolean;
}

/** A remote MCP server, as the API shows it: never a token, key or client secret. */
export interface McpServer {
  id: string;
  name: string;
  url: string;
  /** The catalog entry it connects (`linear`), or empty for one added by address. */
  catalog_id: string;
  auth: McpAuth;
  /** One connection for the team, or one per person. */
  sharing: "shared" | "personal";
  header_name: string;
  has_key: boolean;
  issuer: string | null;
  registration: string | null;
  /** The sign-in server has no registration: an admin pastes a client id. */
  needs_client: boolean;
  has_client: boolean;
  scopes: string[];
  status: McpStatus;
  status_reason: string;
  status_at: string;
  /** Your own connection (a personal server), or the team's. */
  my_connection: { status: McpStatus; status_reason: string; connected_at: string } | null;
  tools: McpTool[];
  skipped: { name: string; reason: string }[];
  tools_listed_at: string;
  /** Allowed tools waiting for a second admin. */
  awaiting_approval: string[];
  /** Who last widened the allowed tools (they can't approve them). */
  changed_by: string;
  custom_prompt: string;
  added_by: string;
  added_at: string;
}

/** What asking a server how it signs in found. */
export interface McpDetected {
  auth: McpAuth;
  tool_count?: number;
  issuer?: string;
  resource?: string;
  scopes?: string[];
  /** `manual`: the sign-in server can't register Coderhelm on its own. */
  registration?: "automatic" | "manual";
}

export interface McpCall {
  tool: string;
  actor: string;
  ok: boolean;
  ms: number;
  detail: string;
  at: string;
}

export interface McpAddRequest {
  url?: string;
  name?: string;
  catalog_id?: string;
  sharing?: "shared" | "personal";
  header_name?: string;
  header_value?: string;
  client_id?: string;
  client_secret?: string;
}

/** One card on Settings → Integrations. */
export interface Integration {
  /** `github`, `jira`, `aws` or `aws-<account>`, `newrelic`, `confluence`, `teams`, or an MCP server id. */
  id: string;
  section: IntegrationSection;
  name: string;
  /** What Coderhelm does with it, in a sentence. */
  does: string;
  status: IntegrationStatus;
  /** Why it isn't working, or a note. */
  reason: string;
  action: IntegrationAction;
  /** RFC 3339, or empty when never checked. */
  last_check: string;
  /** A page with more settings, or empty. */
  manage_href: string;
  detail: Record<string, unknown>;
}

export interface IntegrationsResponse {
  can_edit: boolean;
  items: Integration[];
  /** Old metrics or Airflow connections folded into AWS accounts on this load. */
  migrated: number;
}

/** One ability of a connected AWS account. `available` is null until checked. */
export interface AwsAbility {
  available: boolean | null;
  on: boolean;
  switched_off?: boolean;
}

export interface AwsAccountAbilities {
  account: string;
  region: string;
  role: string;
  status: string;
  checked_at: string;
  check_error: string;
  logs: AwsAbility;
  metrics: AwsAbility;
  airflow: AwsAbility & { found: string[]; skipped: string[]; environments: string[] };
  /** Abilities the role lacks that the add-on stack gives. */
  missing?: string[];
  update_url?: string | null;
  stack_name?: string;
  /** The last live check of this release's permissions. */
  permissions?: AwsPermissions | null;
}

/** One group of the role's permissions: what Coderhelm reads with them, and which are missing. */
export interface AwsPermissionGroup {
  key: string;
  name: string;
  why: string;
  actions: string[];
  missing: string[];
}

/** A live check of a connected account's role against this release's permissions. */
export interface AwsPermissions {
  account: string;
  region: string;
  status: "up_to_date" | "update_needed" | "error";
  /** `simulate` (IAM's policy simulator) or `probe` (one read of each kind). */
  method: string;
  checked_at: string;
  permissions_id: string;
  /** Checked against this release's permissions. */
  current: boolean;
  missing_count: number;
  missing: { action: string; ability: string | null; ability_name: string | null }[];
  missing_abilities: string[];
  abilities: AwsPermissionGroup[];
  update: { url: string; stack_name: string; template_url: string; sign_in_account: string; stacks_url: string } | null;
  problem: { code: string; message: string; fix: string } | null;
}

/** What the connect panel needs to make the role: the Launch Stack link and the manual details. */
export interface AwsRoleSetup {
  cfn_url: string;
  external_id: string;
  template_url: string;
  /** The account the role trusts: this install's own on a self-hosted install. */
  account_id: string;
  trusted_role_prefix: string;
  self_hosted: boolean;
  abilities: { key: string; name: string; why: string; actions: string[] }[];
  permissions_id: string;
}

export interface AwsAbilityReply {
  account: AwsAccountAbilities;
  status: IntegrationStatus;
  reason: string;
  last_check: string;
}

/** Why a team sits under its organisation in the admin overview. */
export type AdminTeamLink = "main" | "github" | "jira" | "member" | "domain";

/** One team in the platform admin's overview. */
export interface AdminTeam {
  team_id: string;
  name: string;
  status: string;
  plan: string;
  created_at: string;
  members: number;
  invites: number;
  repos: number;
  runs_total: number;
  runs_month: number;
  reviews_total: number;
  reviews_month: number;
  cost_month_usd: number;
  tokens_month: number;
  /** Later of members' last sign-in and last use; empty when unknown. */
  last_active_at: string;
  github_org: string;
  has_installation: boolean;
  jira_site: string;
  /** A team of one whose member also belongs to another team. */
  personal: boolean;
  /** Has runs or reviews, or (not personal) repos or a GitHub installation. */
  active: boolean;
  link: AdminTeamLink;
  /** Team switches; only `plugins` so far. */
  flags?: { plugins?: boolean };
}

/** Teams that belong together: the same GitHub installation, Jira site, people or company domain. */
export interface AdminOrg {
  key: string;
  label: string;
  label_from: "github" | "jira" | "name" | "domain" | "none";
  domain: string;
  active: boolean;
  team_count: number;
  personal_count: number;
  members: number;
  repos: number;
  runs_total: number;
  runs_month: number;
  reviews_total: number;
  reviews_month: number;
  cost_month_usd: number;
  last_active_at: string;
  created_at: string;
  plan: string;
  /** Main team first. */
  teams: AdminTeam[];
}

export interface AdminTeamsReply {
  month: string;
  orgs: AdminOrg[];
  teams: AdminTeam[];
  counts: { teams: number; orgs: number; active_orgs: number; inactive_orgs: number };
}

export type BetaSignupStatus = "new" | "invited" | "joined";

/** One person on the beta waitlist. */
export interface BetaSignup {
  email: string;
  original_email: string;
  company: string;
  /** Company email domain; empty for public mail. */
  domain: string;
  reason: string;
  created_at: string;
  status: BetaSignupStatus;
  invited_at: string;
}

export interface BetaSignupsReply {
  signups: BetaSignup[];
  counts: { new: number; invited: number; joined: number; total: number };
}

/** Whose move it is: `open` is support's, `waiting` the customer's. */
export type SupportStatus = "open" | "waiting" | "resolved";
export type SupportPriority = "normal" | "high" | "urgent";
export type SupportItemKind = "run" | "review" | "release" | "plan" | "alert" | "data_source";

/** An item to attach: the server reads its name and status from the team's own record. */
export interface SupportItemRef {
  kind: SupportItemKind;
  id: string;
  label?: string;
  repo?: string;
}

export interface SupportGrant {
  id: string;
  granted_by_email: string;
  granted_at: string;
  until: string;
  note: string;
  ticket_id: string;
  revoked_at: string;
  revoked_by_email: string;
  active: boolean;
}

export interface SupportAuditEntry {
  id: string;
  at: string;
  kind: "granted" | "revoked" | "session_start" | "read" | "refused";
  actor_email: string;
  method: string;
  route: string;
  ticket_id: string;
  detail: string;
}

export interface SupportAccess {
  grant: SupportGrant | null;
  windows: number[];
  log: SupportAuditEntry[];
}

export type SupportViewStatus =
  | { active: false }
  | { active: true; team_id: string; team_name: string; until: string; read_only: true };

export interface SupportItem {
  kind: SupportItemKind;
  id: string;
  label: string;
  repo: string;
  /** Its status when attached: a run's status, a review's verdict, an alert's outcome. */
  status: string;
}

export interface SupportTicket {
  id: string;
  team_id: string;
  team_name: string;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  opened_by_id: string;
  opened_by_email: string;
  opened_by_name: string;
  role: string;
  context: { page: string; item: SupportItem | null; items?: SupportItem[]; user_agent: string };
  created_at: string;
  updated_at: string;
  last_actor: "customer" | "support";
  message_count: number;
  /** Everyone else on the ticket; they get its emails. */
  participants?: SupportParticipant[];
  /** The latest message, one line, and who wrote it. */
  last_snippet?: string;
  last_author_name?: string;
}

export interface SupportParticipant {
  /** `USER#…`; empty for an address copied by email. */
  user_id: string;
  email: string;
  name: string;
  /** Copied by email only: not on the team, cannot sign in. */
  outside: boolean;
  added_by: string;
  added_at: string;
}

export interface SupportPersonRef {
  user_id?: string;
  email?: string;
}

export interface SupportMessage {
  id: string;
  kind: "message" | "event";
  author: "customer" | "support";
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
  attachments?: SupportItem[];
}

export interface SupportDetail {
  ticket: SupportTicket;
  messages: SupportMessage[];
  /** Admin answers only: when the team's support access ends, or null. */
  support_access?: { until: string | null };
  /** Avatars of the people on the ticket, by lowercased address. */
  avatars?: Record<string, string>;
}

export interface NewSupportTicket {
  subject: string;
  body: string;
  priority?: SupportPriority;
  page?: string;
  item?: SupportItemRef;
  items?: SupportItemRef[];
  /** People on the ticket from the start, checked like adding them later. */
  people?: SupportPersonRef[];
}

// ── Learning ────────────────────────────────────────────────────────

export type LearningAgent = "reviewer" | "coder" | "planner" | (string & {});
export type LearningAdjustment = "suppress" | "downgrade" | "raise" | "none";

export interface LearningRewardRow {
  reward: number;
  events: number;
  positive: number;
  negative: number;
}

export interface LearningEvidence {
  kind: string;
  at: string;
  pr?: number;
  run_id?: string;
  detail?: string;
}

export interface LearningChange {
  id: string;
  repo: string;
  kind: "calibration" | "variant" | "lesson" | (string & {});
  key: string;
  from: string;
  to: string;
  reason: string;
  evidence: LearningEvidence[];
  at: string;
  reverted: boolean;
  reverted_by: string;
  reverted_at: string;
}

export interface LearningCategory {
  repo: string;
  category: string;
  accepted: number;
  dismissed: number;
  ignored: number;
  accept_rate: number;
  adjustment: LearningAdjustment;
  exempt: boolean;
  reverted: boolean;
  reason: string;
}

export interface LearningExemplar {
  id: string;
  repo: string;
  kind: "finding" | "fix" | (string & {});
  polarity: "good" | "avoid";
  category: string;
  area: string;
  text: string;
  reward: number;
  uses: number;
  created_at: string;
  pr?: number;
}

export interface LearningArm {
  key: string;
  label: string;
  pulls: number;
  mean: number;
  ucb: number;
  eligible: boolean;
}

export interface LearningBandit {
  agent: LearningAgent;
  pinned: string;
  default_arm: string;
  exploration_cap: number;
  arms: LearningArm[];
}

export interface Learning {
  days: number;
  repo: string;
  min_samples: number;
  can_manage: boolean;
  weights: Record<string, number>;
  default_weights: Record<string, number>;
  signals: { kind: string; label: string; weight: number; count: number }[];
  totals: { events: number; reward: number };
  trend: { date: string; agent: LearningAgent; repo: string; reward: number; events: number }[];
  agents: ({ agent: LearningAgent } & LearningRewardRow)[];
  repos: ({ repo: string } & LearningRewardRow)[];
  categories: LearningCategory[];
  changes: LearningChange[];
  exemplars: LearningExemplar[];
  bandit: LearningBandit[];
}

// ── This install (self-hosted) ──────────────────────────────────────────

export interface AutoUpdateSettings {
  auto: boolean;
  channel: "stable" | "preview";
  /** mon…sun, or daily */
  day: string;
  hour: number;
  timezone: string;
  majors: "ask" | "auto";
}

export interface UpdateEntry {
  id?: string;
  version: string;
  from_version?: string;
  actor: string;
  mode?: "update" | "rollback";
  status: "running" | "succeeded" | "failed" | "rolled_back";
  reason?: string;
  /** "model check skipped for …" when an admin skipped a model the release doesn't call. */
  note?: string;
  started_at?: string;
  finished_at?: string;
}

/** How to fix a check: plain words, and any of a command, a link out, or a dashboard page. */
export interface CheckFix {
  text: string;
  command?: string;
  url?: string;
  href?: string;
}

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

/** One server-side setup check (GET /api/system/checks). */
export interface InstallCheck {
  key: string;
  group: string;
  label: string;
  status: CheckStatus;
  detail: string;
  why?: string;
  fix?: CheckFix;
}

export interface SystemChecks {
  checked_at: string;
  summary: { pass: number; warn: number; fail: number; skip: number; ready: boolean };
  checks: InstallCheck[];
}

/** One DNS record to add for your own domain. */
export interface DomainRecord {
  purpose: "certificate" | "address";
  name: string;
  type: string;
  value: string;
}

/** The updater's view of the domain (GET /api/system/domain `domain`). */
export interface DomainView {
  hostname: string | null;
  state: "none" | "validating" | "attaching" | "live" | "failed" | "removing";
  mode: "route53" | "external" | "config" | null;
  reason?: string;
  zone?: string | null;
  name_servers?: string[];
  current?: string | null;
  target?: string | null;
  certificate?: { status?: string; failure_reason?: string | null } | null;
  records: DomainRecord[];
}

export interface SystemDomain {
  available: boolean;
  reason?: string;
  status?: "pass" | "warn" | "fail" | "skip" | "wait";
  code?: string;
  domain?: DomainView | null;
  check?: InstallCheck;
}

/** Something that would stop (block) or should pause (warn) an update. */
export interface UpdateBlocker {
  key: string;
  severity: "block" | "warn";
  detail: string;
  fix: CheckFix;
}

export interface SystemPreflight {
  checked_at: string;
  ready: boolean;
  current: string | null;
  latest: string | null;
  blockers: UpdateBlocker[];
  checks: InstallCheck[];
}

/** One model's test call, explained (common::model_access on the platform). */
export interface ModelAccess {
  model: string;
  /** What was called: the Bedrock id, or the model's name on the Anthropic API. */
  id: string;
  status: "pass" | "fail" | "skip";
  code: string;
  detail: string;
  fix?: string;
  url?: string;
  href?: string;
  /** Update check: the release calls this model (no skipping it). */
  required?: boolean;
}

/** The updater's check of the next release's models. */
export interface ModelCheck {
  version: string;
  checked_at: string;
  ok: boolean;
  provider?: string | null;
  region?: string | null;
  results: ModelAccess[];
  /** Only a model the release doesn't call failed: Update now may skip it. */
  skippable?: boolean;
  /** The release's signature is being checked before its model list is read. */
  pending?: boolean;
  note?: string;
}

export type ModelProviderId = "bedrock" | "anthropic";

export interface ModelsChoice {
  provider: ModelProviderId;
  inference_prefix?: string;
  model_ids?: Record<string, string>;
}

export interface SystemModels {
  provider: ModelProviderId;
  inference_prefix: string;
  model_ids: Record<string, string>;
  /** `deploy`: the install config's first-boot choice; `settings`: changed here. */
  source: "deploy" | "settings";
  updated_at: string | null;
  updated_by: string | null;
  deploy_default: { provider: ModelProviderId; inference_prefix: string };
  region: string;
  /** The models this release calls. */
  models: string[];
  /** The Bedrock id each model is called by under these settings. */
  bedrock_ids: Record<string, string>;
  prefixes: string[];
  results?: ModelAccess[];
}

export interface SystemVersion {
  self_hosted: boolean;
  current: { version: string | null; commit: string | null; released_at: string | null; config_fingerprint: string | null };
  latest: null | { version: string; notes: string; published_at?: string; url?: string; prerelease?: boolean; breaking: boolean };
  update_available: boolean;
  settings?: AutoUpdateSettings;
  running?: boolean;
  history?: UpdateEntry[];
  /** The latest release's model check, once it has run. */
  model_check?: ModelCheck | null;
}

// ── Deliveries ──────────────────────────────────────────────────────────

export type DeliveryStatus = "received" | "pending" | "handled" | "ignored" | "failed";
export type DeliveryStatusFilter = "all" | "ok" | "failed" | "pending" | "handled" | "ignored";

export interface DeliveryFilter {
  source?: string;
  status?: DeliveryStatusFilter;
  /** RFC 3339. */
  since?: string;
  /** RFC 3339, exclusive: with `since`, one hour or day of the overview. */
  until?: string;
  q?: string;
  /** Only deliveries to this webhook endpoint. */
  endpoint?: string;
  /** Only failures with this reason code. */
  reason?: string;
  limit?: number;
}

/** One webhook or notice, in or out (a list row). */
export interface DeliveryRow {
  /** May hold ':' ("alert:01J…", "relay:…"): always encode it in a path. */
  id: string;
  direction: "inbound" | "outbound";
  source: string;
  event: string;
  target: string;
  status: DeliveryStatus;
  outcome: string;
  /** A reason code; the detail explains it in words. */
  reason: string;
  external_id: string;
  repo: string;
  pr: number | null;
  created_at: string;
  duration_ms: number;
  attempts: number;
  next_retry_at: string | null;
}

export interface DeliveryAttempt {
  at: string;
  code?: number;
  duration_ms: number;
  error?: string;
}

export interface DeliveryFull extends Omit<DeliveryRow, "attempts"> {
  attempts: DeliveryAttempt[];
  /** Secrets are already "[redacted]". */
  headers: Record<string, string>;
  /** May be empty, or "[N bytes, not JSON: not kept]". */
  payload_preview: string;
  payload_bytes: number;
  redeliver?: "github" | "relay" | "notify_test" | "webhook";
  /** A webhook delivery's endpoint (Settings, Webhooks). */
  endpoint_id?: string;
}

export interface DeliveriesSummary {
  total: number;
  ok: number;
  failed: number;
  pending: number;
  /** 0..1, or null with nothing to measure. */
  success_rate: number | null;
  oldest_pending_at: string | null;
  last_failure_at: string | null;
}

export interface DeliveriesReply {
  deliveries: DeliveryRow[];
  summary: DeliveriesSummary;
  sources: string[];
  retention_days: number;
  sharing: { available: boolean; enabled: boolean; payloads: boolean };
  hybrid: boolean;
}

export interface DeliveryDetailReply {
  delivery: DeliveryFull;
  reason: { code: string; message: string; fix: string } | null;
  can_redeliver: boolean;
}

export type DeliveryPeriod = "24h" | "7d" | "30d";

export interface DeliveryAnalyticsFilter {
  period?: DeliveryPeriod;
  source?: string;
  /** Retrying deliveries count once they finish, so there is no `pending`. */
  status?: Exclude<DeliveryStatusFilter, "pending">;
  endpoint?: string;
}

export interface DeliveryTotals {
  deliveries: number;
  handled: number;
  ignored: number;
  failed: number;
  /** 0..1, or null with nothing finished. */
  success_rate: number | null;
  retried: number;
  retried_ok: number;
  /** Null while a status filter is on. */
  retries: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
}

export interface DeliveryPoint {
  start: string;
  end: string;
  deliveries: number;
  ok: number;
  failed: number;
  success_rate: number | null;
  p95_ms: number | null;
  previous_deliveries: number;
}

export interface DeliverySourceRow {
  source: string;
  direction: "inbound" | "outbound";
  deliveries: number;
  ok: number;
  failed: number;
  success_rate: number | null;
  p95_ms: number | null;
  previous_deliveries: number;
  previous_success_rate: number | null;
}

export interface DeliveryReasonRow {
  code: string;
  message: string;
  fix: string;
  count: number;
  previous_count: number;
  sources: string[];
}

export interface DeliveryEventRow {
  event: string;
  source: string;
  failed: number;
}

export interface DeliveryEndpointRow {
  id: string;
  url: string;
  description: string;
  deleted: boolean;
  enabled: boolean;
  /** "manual" or "failing"; empty while on. */
  disabled_reason: string;
  deliveries: number;
  ok: number;
  failed: number;
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  streak: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  last_failure_message: string | null;
  failing_since: string | null;
  last_success_at: string | null;
}

export interface DeliveryAnalytics {
  period: DeliveryPeriod;
  granularity: "hour" | "day";
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  summary: DeliveryTotals;
  previous: DeliveryTotals;
  series: DeliveryPoint[];
  sources: DeliverySourceRow[];
  reasons: DeliveryReasonRow[];
  events: DeliveryEventRow[];
  endpoints: DeliveryEndpointRow[];
  seen_sources: string[];
  backfill: { complete: boolean };
  kept_days: number;
  records_kept_days: number;
}

// ── Hybrid (self-hosted) ────────────────────────────────────────────────

export type HybridCheckStatus = "pass" | "fail" | "wait" | "todo";
export type HybridIntegrationId = "github" | "jira" | "notion" | "confluence" | "google_drive" | (string & {});

export interface HybridGithubLink {
  installation_id: number;
  account: string;
  repositories: string[];
}

export interface HybridIntegration {
  id: HybridIntegrationId;
  name: string;
  mode: "hosted" | "direct" | "unavailable";
  through_coderhelm: string;
  stays_with_you: string;
  reason?: string;
  uses_coderhelm: boolean;
  /** False when Coderhelm's own app for it isn't set up, so it can't be chosen now. Missing from older gateways. */
  offered?: boolean;
}

export interface HybridCheck {
  id: string;
  status: HybridCheckStatus;
  code: string;
  title: string;
  fix: string | null;
}

export interface HybridStatus {
  available: boolean;
  hosted_url: string;
  registered: boolean;
  install_id: string | null;
  cloudfront: string;
  verified: boolean;
  name: { name: string; hostname: string; code: string } | null;
  github: { mode: "own" | "hosted"; links: HybridGithubLink[]; app_slug: string | null };
  integrations: HybridIntegration[];
  sharing: { enabled: boolean; payloads: boolean };
  checks: HybridCheck[];
}

export interface HybridNameCheck {
  name: string;
  hostname?: string;
  available: boolean;
  code: string;
  error: string | null;
}

export interface HybridSettingsPatch {
  github_mode?: "own" | "hosted";
  /** The hosted-app integrations among jira, notion, confluence, google_drive (github follows github_mode). */
  integrations?: string[];
  sharing?: { enabled: boolean; payloads: boolean };
}
