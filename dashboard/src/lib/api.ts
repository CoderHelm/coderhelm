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
    if (res.status === 402) {
      throw new Error("Your subscription is inactive. Please update your billing to continue.");
    }
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // Auth
  me: () => request<{ user_id: string; tenant_id: string; github_login: string; email: string; avatar_url: string }>("/api/me"),

  // Health
  getHealth: () => request<HealthCheck>("/api/health"),

  // Banners
  getBanners: () => request<{ banners: Banner[] }>("/api/banners"),

  // Runs
  listRuns: () => request<{ runs: Run[] }>("/api/runs"),
  getRun: (id: string) => request<Run>(`/api/runs/${id}`),

  // Repos
  listRepos: () => request<{ repos: Repo[] }>("/api/repos"),
  toggleRepo: (repo: string, enabled: boolean) => request<void>(`/api/repos/${repo}`, { method: "POST", body: JSON.stringify({ enabled }) }),
  deleteRepo: (repo: string) => request<void>(`/api/repos/${repo}`, { method: "DELETE" }),

  // Stats
  getStats: () => request<{ month: Stats; all_time: Stats }>("/api/stats"),
  getStatsHistory: () => request<{ months: MonthStats[] }>("/api/stats/history"),

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
  generateJiraSecret: () => request<{ secret: string }>("/api/integrations/jira/secret", { method: "POST" }),
  deleteJiraSecret: () => request<void>("/api/integrations/jira/secret", { method: "DELETE" }),

  // Billing
  getBilling: () => request<BillingInfo>("/api/billing"),
  createSubscription: () => request<{ client_secret: string }>("/api/billing/subscribe", { method: "POST", body: "{}" }),
  cancelSubscription: () => request<{ status: string }>("/api/billing/cancel", { method: "POST" }),
  reactivateSubscription: () => request<{ status: string }>("/api/billing/reactivate", { method: "POST" }),
  createSetupIntent: () => request<{ client_secret: string }>("/api/billing/payment-method", { method: "POST" }),
  listPaymentMethods: () => request<{ payment_methods: PaymentMethod[] }>("/api/billing/payment-methods"),
  deletePaymentMethod: (pmId: string) => request<{ status: string }>(`/api/billing/payment-methods/${pmId}`, { method: "DELETE" }),
  getBillingCustomer: () => request<{ email: string | null; name: string | null }>("/api/billing/customer"),
  updateBillingEmail: (email: string) => request<{ email: string }>("/api/billing/email", { method: "PUT", body: JSON.stringify({ email }) }),
  listInvoices: () => request<{ invoices: Invoice[] }>("/api/billing/invoices"),
  getInvoicePdf: (id: string) => request<{ pdf_url: string }>(`/api/billing/invoices/${id}/pdf`),

  // Budget
  getBudget: () => request<{ max_budget_cents: number }>("/api/settings/budget"),
  updateBudget: (max_budget_cents: number) => request<void>("/api/settings/budget", { method: "PUT", body: JSON.stringify({ max_budget_cents }) }),

  // Plans
  listPlans: () => request<{ plans: Plan[] }>("/api/plans"),
  planChat: (messages: { role: string; content: string }[]) =>
    request<{ content: string }>("/api/plans/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  createPlan: (body: { title: string; description?: string; repo?: string; tasks?: Partial<Task>[] }) =>
    request<{ plan_id: string }>("/api/plans", { method: "POST", body: JSON.stringify(body) }),
  getPlan: (planId: string) => request<Plan & { tasks: Task[] }>(`/api/plans/${planId}`),
  updatePlan: (planId: string, body: Partial<{ title: string; description: string; status: string }>) =>
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
  executePlan: (planId: string) =>
    request<{ status: string; tasks_queued: number }>(`/api/plans/${planId}/execute`, { method: "POST" }),

  // Infrastructure
  getInfrastructure: () => request<InfraAnalysis>("/api/infrastructure"),
  refreshInfrastructure: () =>
    request<{ status: string }>("/api/infrastructure/refresh", { method: "POST" }),
  getRepoInfrastructure: (repo: string) =>
    request<InfraAnalysis>(`/api/infrastructure/repo/${repo}`),
  refreshRepoInfrastructure: (repo: string) =>
    request<{ status: string }>(`/api/infrastructure/repo/${repo}/refresh`, { method: "POST" }),
};

export interface Run {
  run_id: string;
  status: string;
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
  email_run_complete: boolean;
  email_run_failed: boolean;
  email_weekly_summary: boolean;
}

export interface BillingInfo {
  subscription_status: string;
  previous_status: string | null;
  plan_id: string | null;
  has_payment_method: boolean;
  stripe_publishable_key: string;
  last_payment_at: string | null;
  payment_retry_count: number;
  last_failure_reason: string | null;
  access_until: string | null;
  cancelled_at: string | null;
  limits: {
    tokens: number;
    overage_per_1k_tokens_cents: number;
  };
  current_period: {
    month: string;
    usage_cost: number;
    total_runs: number;
    total_tokens: number;
    total_plans: number;
    estimated_overage_cents: number;
  };
  recent_payments: Payment[];
}

export interface Payment {
  invoice_number: string | null;
  amount_cents: number | null;
  status: string | null;
  created_at: string | null;
}

export interface Banner {
  id: string;
  message: string;
  type: "info" | "warning" | "error";
  dismissible: boolean;
  link_text?: string;
  link_url?: string;
}

export interface Invoice {
  invoice_id: string | null;
  invoice_number: string | null;
  amount_cents: number | null;
  period: string | null;
  status: string | null;
  created_at: string | null;
}

export interface PaymentMethod {
  id: string;
  type: "card" | "us_bank_account" | string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  us_bank_account?: {
    bank_name: string;
    last4: string;
    account_type: string;
  };
}

export interface Plan {
  plan_id: string;
  title: string;
  description: string;
  repo: string;
  status: "draft" | "executing" | "done" | string;
  task_count: number;
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
  status: "draft" | "approved" | "rejected" | "queued" | "running" | "done" | string;
  order: number;
  repo?: string;
  issue_number?: number;
  issue_url?: string;
  run_id?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
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
  installation_id: number;
  tenant_id: string;
  webhook_url: string;
  checklist: string[];
}


