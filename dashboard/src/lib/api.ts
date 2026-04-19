const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
    try { serverMsg = body ? JSON.parse(body).error || "" : ""; } catch {}
    throw new Error(serverMsg || `API ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // Auth
  me: () => request<{ user_id: string; team_id: string; github_login: string | null; email: string; avatar_url: string; role: string; status?: string; auth_provider?: string; mfa_enabled?: boolean }>("/api/me"),
  signup: (email: string, password: string) =>
    request<{ status: string; message: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  joinWaitlist: (email: string) =>
    request<{ status: string; message: string }>("/auth/waitlist", { method: "POST", body: JSON.stringify({ email }) }),
  loginEmail: (email: string, password: string) =>
    request<{ status: string; session?: string; team_id?: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  verifyEmail: (email: string, code: string) =>
    request<{ status: string; message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) }),
  forgotPassword: (email: string) =>
    request<{ status: string; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  confirmReset: (email: string, code: string, new_password: string) =>
    request<{ status: string; message: string }>("/auth/confirm-reset", { method: "POST", body: JSON.stringify({ email, code, new_password }) }),
  mfaVerify: (session: string, code: string, email: string) =>
    request<{ status: string; team_id?: string }>("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ session, code, email }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // Allowlist
  listAllowlist: () => request<{ emails: string[] }>("/api/allowlist"),
  addToAllowlist: (email: string) =>
    request<{ status: string }>("/api/allowlist", { method: "POST", body: JSON.stringify({ email }) }),
  removeFromAllowlist: (email: string) =>
    request<{ status: string }>("/api/allowlist", { method: "DELETE", body: JSON.stringify({ email }) }),

  // Health
  getHealth: () => request<HealthCheck>("/api/health"),

  // Banners
  getBanners: () => request<{ banners: Banner[] }>("/api/banners"),

  // Account
  resetAccount: () => request<void>("/api/account/reset", { method: "POST" }),
  listTeams: () => request<{ teams: TeamInfo[] }>("/api/teams"),
  switchTeam: (teamId: string) => request<{ team_id: string }>("/api/teams/switch", { method: "POST", body: JSON.stringify({ team_id: teamId }) }),
  renameTeam: (name: string) => request<{ status: string; name: string }>("/api/teams/rename", { method: "PUT", body: JSON.stringify({ name }) }),

  // Runs
  listRuns: () => request<{ runs: Run[] }>("/api/runs"),
  listJiraEvents: () => request<{ events: JiraEvent[]; total: number }>("/api/integrations/jira/events?limit=20"),
  getRun: (id: string) => request<RunDetail>(`/api/runs/${id}`),
  getRunOpenspec: (id: string) => request<Openspec>(`/api/runs/${id}/openspec`),
  getAgentLog: (id: string) => request<{ passes: AgentLogPass[]; live_events: { tool: string; input_summary: string; duration_ms: number; is_error: boolean; timestamp: string }[] }>(`/api/runs/${id}/agent-log`),
  retryRun: (id: string) => request<{ status: string }>(`/api/runs/${id}/retry`, { method: "POST" }),
  reReviewRun: (id: string) => request<{ status: string }>(`/api/runs/${id}/re-review`, { method: "POST" }),
  cancelRun: (id: string) => request<{ status: string }>(`/api/runs/${id}/cancel`, { method: "POST" }),
  getRunTraces: (id: string) => request<{ traces: PassTrace[] }>(`/api/runs/${id}/traces`),

  // Repos
  listRepos: () => request<{ repos: Repo[] }>("/api/repos"),
  syncRepos: () => request<{ total: number; added: number }>("/api/repos/sync", { method: "POST" }),
  toggleRepo: (repo: string, enabled: boolean) => request<void>(`/api/repos/${repo}`, { method: "POST", body: JSON.stringify({ enabled }) }),
  deleteRepo: (repo: string) => request<void>(`/api/repos/${repo}`, { method: "DELETE" }),

  // Stats
  getStats: () => request<{ month: Stats; all_time: Stats }>("/api/stats"),
  getStatsHistory: () => request<{ months: MonthStats[] }>("/api/stats/history"),

  // GitHub App installation
  getInstallationStatus: () => request<{ status: string; github_org?: string; installation_id?: number }>("/api/github/installation-status"),
  linkGithubInstallation: (installation_id: number) =>
    request<{ status?: string; error?: string; github_org?: string; installation_id?: number; repos_synced?: number }>("/api/github/link-installation", { method: "POST", body: JSON.stringify({ installation_id }) }),

  // Rules (guardrails)
  getGlobalRules: () => request<{ rules: string[] }>("/api/rules/global"),
  updateGlobalRules: (rules: string[]) => request<void>("/api/rules/global", { method: "PUT", body: JSON.stringify({ rules }) }),
  getRepoRules: (repo: string) => request<{ rules: string[] }>(`/api/rules/repo/${repo}`),
  updateRepoRules: (repo: string, rules: string[]) => request<void>(`/api/rules/repo/${repo}`, { method: "PUT", body: JSON.stringify({ rules }) }),

  // Voice
  getGlobalVoice: () => request<{ content: string }>("/api/voice/global"),
  updateGlobalVoice: (content: string) => request<void>("/api/voice/global", { method: "PUT", body: JSON.stringify({ content }) }),
  getRepoVoice: (repo: string) => request<{ content: string }>(`/api/voice/repo/${repo}`),
  updateRepoVoice: (repo: string, content: string) => request<void>(`/api/voice/repo/${repo}`, { method: "PUT", body: JSON.stringify({ content }) }),

  // Agents
  getGlobalAgents: () => request<{ content: string }>("/api/agents/global"),
  getRepoAgents: (repo: string) => request<{ content: string }>(`/api/agents/repo/${repo}`),
  updateRepoAgents: (repo: string, content: string) => request<void>(`/api/agents/repo/${repo}`, { method: "PUT", body: JSON.stringify({ content }) }),

  // Instructions
  getGlobalInstructions: () => request<{ content: string }>("/api/instructions/global"),
  updateGlobalInstructions: (content: string) => request<void>("/api/instructions/global", { method: "PUT", body: JSON.stringify({ content }) }),
  getRepoInstructions: (repo: string) => request<{ content: string }>(`/api/instructions/repo/${repo}`),
  updateRepoInstructions: (repo: string, content: string) => request<void>(`/api/instructions/repo/${repo}`, { method: "PUT", body: JSON.stringify({ content }) }),

  // Regenerate (re-run onboard for a repo)
  regenerateRepo: (repo: string) => request<{ status: string }>(`/api/repos/${repo}/regenerate`, { method: "POST" }),

  // Notifications
  getNotifications: () => request<NotificationPrefs>("/api/notifications"),
  updateNotifications: (prefs: NotificationPrefs) => request<void>("/api/notifications", { method: "PUT", body: JSON.stringify(prefs) }),

  // Jira integration
  getJiraCheck: () => request<JiraCheck>("/api/integrations/jira/check"),
  generateJiraSecret: () => request<{ token: string; webhook_secret: string }>("/api/integrations/jira/secret", { method: "POST" }),
  deleteJiraSecret: () => request<void>("/api/integrations/jira/secret", { method: "DELETE" }),
  deleteJiraIntegration: () => request<void>("/api/integrations/jira/check", { method: "DELETE" }),
  getJiraConfig: () => request<JiraConfig>("/api/integrations/jira/config"),
  updateJiraConfig: (body: Partial<JiraConfig>) =>
    request<void>("/api/integrations/jira/config", { method: "PUT", body: JSON.stringify(body) }),
  fetchJiraProjects: () => request<{ projects: JiraProject[] }>("/api/integrations/jira/projects/fetch"),
  updateJiraProjects: (projects: JiraProject[]) =>
    request<void>("/api/integrations/jira/projects", { method: "PUT", body: JSON.stringify({ projects }) }),

  // Usage
  getUsage: () => request<UsageInfo>("/api/usage"),

  // Token Limit
  getBudget: () => request<{ max_tokens: number }>("/api/settings/budget"),
  updateBudget: (max_tokens: number) => request<void>("/api/settings/budget", { method: "PUT", body: JSON.stringify({ max_tokens }) }),

  // Model Provider
  getModelProvider: () => request<ModelProviderConfig>("/api/settings/model-provider"),
  updateModelProvider: (config: { api_key?: string; primary_model: string; heavy_model: string }) =>
    request<{ status: string; provider: string }>("/api/settings/model-provider", { method: "PUT", body: JSON.stringify(config) }),
  deleteModelProvider: () => request<void>("/api/settings/model-provider", { method: "DELETE" }),

  // Workflow
  getWorkflowSettings: () => request<WorkflowSettings>("/api/settings/workflow"),
  updateWorkflowSettings: (settings: WorkflowSettings) => request<void>("/api/settings/workflow", { method: "PUT", body: JSON.stringify(settings) }),

  // Plans
  listPlans: (cursor?: string) => request<{ plans: Plan[]; next_cursor?: string }>(`/api/plans${cursor ? `?cursor=${cursor}` : ""}`),
  planChat: (messages: { role: string; content: string }[]) =>
    request<{ content: string; mcp_servers?: string[] }>("/api/plans/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  createPlan: (body: { title: string; description?: string; repo?: string; destination?: "github" | "jira"; tasks?: Partial<Task>[]; mcp_servers?: string[] }) =>
    request<{ plan_id: string }>("/api/plans", { method: "POST", body: JSON.stringify(body) }),
  getPlan: (planId: string) => request<Plan & { tasks: Task[] }>(`/api/plans/${planId}`),
  updatePlan: (planId: string, body: Partial<{ title: string; description: string; status: string; destination: string }>) =>
    request<void>(`/api/plans/${planId}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePlan: (planId: string) => request<void>(`/api/plans/${planId}`, { method: "DELETE" }),
  addTask: (planId: string, body: Partial<Task>) =>
    request<{ task_id: string }>(`/api/plans/${planId}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (planId: string, taskId: string, body: Partial<Task>) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}`, { method: "DELETE" }),
  approveTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}/approve`, { method: "POST" }),
  rejectTask: (planId: string, taskId: string) =>
    request<void>(`/api/plans/${planId}/tasks/${taskId}/reject`, { method: "POST" }),
  forceRunTask: (planId: string, taskId: string) =>
    request<{ status: string }>(`/api/plans/${planId}/tasks/${taskId}/force-run`, { method: "POST" }),
  executePlan: (planId: string) =>
    request<{ status: string; tasks_queued: number }>(`/api/plans/${planId}/execute`, { method: "POST" }),
  approveAllAndExecute: (planId: string) =>
    request<{ status: string; tasks_queued: number }>(`/api/plans/${planId}/approve-and-execute`, { method: "POST" }),
  generatePlanOpenspec: (planId: string) =>
    request<{ files: string[] }>(`/api/plans/${planId}/openspec/generate`, { method: "POST" }),
  getPlanOpenspec: (planId: string) =>
    request<{ proposal: string; design: string; tasks: string; spec: string }>(`/api/plans/${planId}/openspec`),

  // Plan Templates
  listTemplates: (params?: { limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const q = qs.toString();
    return request<{ templates: Template[]; next_cursor?: string }>(`/api/plans/templates${q ? `?${q}` : ""}`);
  },
  createTemplate: (body: { title: string; description?: string; category?: string; tags?: string[]; task_templates?: TaskTemplate[] }) =>
    request<{ template_id: string }>("/api/plans/templates", { method: "POST", body: JSON.stringify(body) }),
  createTemplateFromPlan: (planId: string, body: { title?: string; description?: string; category?: string; tags?: string[] }) =>
    request<{ template_id: string }>(`/api/plans/templates/from-plan/${planId}`, { method: "POST", body: JSON.stringify(body) }),
  getTemplate: (templateId: string) => request<Template>(`/api/plans/templates/${templateId}`),
  deleteTemplate: (templateId: string) => request<void>(`/api/plans/templates/${templateId}`, { method: "DELETE" }),
  useTemplate: (templateId: string, body: { title?: string; description?: string; repo?: string; destination?: string }) =>
    request<{ plan_id: string }>(`/api/plans/templates/${templateId}/use`, { method: "POST", body: JSON.stringify(body) }),

  // Infrastructure
  getInfrastructure: () => request<InfraAnalysis>("/api/infrastructure"),
  refreshInfrastructure: () =>
    request<{ status: string }>("/api/infrastructure/refresh", { method: "POST" }),
  getRepoInfrastructure: (repo: string) =>
    request<InfraAnalysis>(`/api/infrastructure/repo/${repo}`),
  refreshRepoInfrastructure: (repo: string) =>
    request<{ status: string }>(`/api/infrastructure/repo/${repo}/refresh`, { method: "POST" }),

  // User management
  listUsers: () => request<{ users: TeamUser[] }>("/api/users"),
  inviteUser: (email: string, role?: string) =>
    request<{ status: string; user_id: string }>("/api/users/invite", { method: "POST", body: JSON.stringify({ email, role }) }),
  updateUserRole: (userId: string, role: string) =>
    request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  removeUser: (userId: string) =>
    request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  resendInvite: (userId: string) =>
    request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}/resend`, { method: "POST" }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>("/api/users/password", { method: "PUT", body: JSON.stringify({ current_password, new_password }) }),
  mfaSetup: (password: string) =>
    request<{ secret: string; qr_uri: string; session: string }>("/api/users/mfa/setup", { method: "POST", body: JSON.stringify({ password }) }),
  mfaVerifySetup: (password: string, code: string, session: string) =>
    request<{ status: string }>("/api/users/mfa/verify", { method: "POST", body: JSON.stringify({ password, code, session }) }),
  mfaDisable: () => request<{ status: string }>("/api/users/mfa", { method: "DELETE" }),

  // AWS Connections (Log Analyzer)
  listAwsConnections: () => request<{ connections: AwsConnection[] }>("/api/aws-connections"),
  createAwsConnection: (role_arn: string, region?: string, external_id?: string) =>
    request<{ connection_id?: string; external_id?: string; status?: string; error?: string; message?: string }>("/api/aws-connections", { method: "POST", body: JSON.stringify({ role_arn, region, external_id }) }),
  updateAwsConnection: (id: string, body: Partial<{ role_arn: string; region: string; log_groups: string[] }>) =>
    request<{ status: string }>(`/api/aws-connections/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAwsConnection: (id: string) =>
    request<{ status: string }>(`/api/aws-connections/${id}`, { method: "DELETE" }),
  testAwsConnection: (id: string) =>
    request<{ status: string; message: string }>(`/api/aws-connections/${id}/test`, { method: "POST" }),
  discoverLogGroups: (id: string) =>
    request<{ log_groups: LogGroup[] }>(`/api/aws-connections/${id}/log-groups`),
  getCfnUrl: () =>
    request<{ cfn_url: string; external_id: string }>("/api/aws-connections/cfn-url"),

  // Recommendations
  listRecommendations: (params?: { status?: string; severity?: string }) =>
    request<{ recommendations: Recommendation[] }>(`/api/recommendations${params ? `?${new URLSearchParams(params as Record<string, string>)}` : ""}`),
  createPlanFromRecommendation: (id: string) =>
    request<{ plan_id: string; status: string }>(`/api/recommendations/${id}/plan`, { method: "POST" }),
  dismissRecommendation: (id: string) =>
    request<{ status: string }>(`/api/recommendations/${id}/dismiss`, { method: "POST" }),

  // Plugins
  getPluginCatalog: () => request<{ plugins: PluginDef[] }>("/api/plugins/catalog"),
  listEnabledPlugins: () => request<{ plugins: EnabledPlugin[] }>("/api/plugins"),
  enablePlugin: (id: string) =>
    request<{ status: string; plugin_id: string }>(`/api/plugins/${id}/enable`, { method: "POST" }),
  disablePlugin: (id: string) =>
    request<{ status: string; plugin_id: string }>(`/api/plugins/${id}`, { method: "DELETE" }),
  updatePluginCredentials: (id: string, credentials: Record<string, string>) =>
    request<{ status: string; error?: string }>(`/api/plugins/${id}/credentials`, { method: "PUT", body: JSON.stringify({ credentials }) }),
  updatePluginPrompt: (id: string, custom_prompt: string) =>
    request<{ status: string; error?: string }>(`/api/plugins/${id}/prompt`, { method: "PUT", body: JSON.stringify({ custom_prompt }) }),
  testPluginConnection: (id: string) =>
    request<{ status: string; tool_count?: number; message?: string }>(`/api/plugins/${id}/test`, { method: "POST" }),

  // Memory
  listMemories: (repo: string, page = 1, pageSize = 50, search?: string, memoryType?: string) => {
    const params = new URLSearchParams({ repo, page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (memoryType) params.set("memory_type", memoryType);
    return request<MemoryListResponse>(`/api/memories?${params}`);
  },
  getMemoryStats: (repo: string) =>
    request<MemoryStats>(`/api/memories/stats?repo=${encodeURIComponent(repo)}`),
  deleteMemory: (id: string, repo: string) =>
    request<{ deleted: string }>(`/api/memories/${id}?repo=${encodeURIComponent(repo)}`, { method: "DELETE" }),
};

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
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
  duration_s?: number;
  created_at: string;
  current_pass?: string;
}

export interface RunDetail extends Run {
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
  progress_notes?: { message: string; timestamp: string }[];
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
  usage?: { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number };
  stop_reason?: string;
}

export interface AgentLogPass {
  pass: string;
  conversation: AgentLogTurn[];
}

export interface Repo {
  name: string;
  enabled: boolean;
  ticket_source: string;
  onboard_status?: "pending" | "ready" | "failed";
  onboard_error?: string;
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

export interface NotificationPrefs {
  email_token_warning: boolean;
  email_weekly_summary: boolean;
}

export interface WorkflowSettings {
  commit_openspec: boolean;
  default_destination: "github" | "jira";
  allow_plan_log_analyzer: boolean;
}

export interface UsageInfo {
  month: string;
  total_tokens: number;
  tokens_in: number;
  tokens_out: number;
  total_runs: number;
  max_tokens: number;
}

export interface ModelProviderConfig {
  provider: "anthropic";
  api_key_masked: string | null;
  primary_model: string | null;
  heavy_model: string | null;
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
  status: "draft" | "executing" | "done" | string;
  task_count: number;
  tokens_in?: number;
  tokens_out?: number;
  mcp_servers?: string[];
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
  status: "draft" | "approved" | "rejected" | "queued" | "running" | "done" | "waiting" | string;
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
  category: "security" | "performance" | "reliability";
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
  depth?: number;
  visible?: number;
  in_flight?: number;
  items?: { run_id?: string; title?: string; status?: string; error?: string; created_at?: string }[];
}

export interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  checked_at: string;
  checks: HealthCheckItem[];
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

export interface AwsConnection {
  connection_id: string;
  role_arn: string;
  external_id: string;
  region: string;
  status: string;
  error_message?: string;
  log_groups: string[];
  created_at?: string;
  updated_at?: string;
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
  error_hash?: string;
  error_count?: number;
  plan_id?: string;
  created_at?: string;
  updated_at?: string;
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
}

export interface EnabledPlugin {
  plugin_id: string;
  enabled: boolean;
  has_credentials: boolean;
  enabled_at: string | null;
  custom_prompt: string | null;
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