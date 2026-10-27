// What the gateway answers for a live check of an AWS role's permissions
// (services/common/src/live/permissions.rs, `PermissionCheck::view`).

const GROUPS = [
  { key: "logs", name: "CloudWatch logs and alarms", why: "Reads error lines and alarm states so Coderhelm can find what broke and propose a fix.", actions: ["logs:DescribeLogGroups", "logs:StartQuery", "logs:GetQueryResults", "logs:StopQuery", "logs:FilterLogEvents", "logs:GetLogEvents", "cloudwatch:DescribeAlarms", "sts:GetCallerIdentity"] },
  { key: "check", name: "Checking its own permissions", why: "Asks IAM which of these permissions the role has, and whether CoderHelm's own update stack finished, so this page can say when an update is needed. It only looks at this one role and CoderHelm's update stacks.", actions: ["iam:SimulatePrincipalPolicy", "cloudformation:DescribeStacks"] },
  { key: "metrics", name: "CloudWatch metrics", why: "Reads error rate, latency and other metrics before and after a deploy.", actions: ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics"] },
  { key: "airflow", name: "Airflow", why: "Reads DAG runs, task logs and import errors as Airflow's Viewer role, which can't trigger or change anything.", actions: ["airflow:ListEnvironments", "airflow:GetEnvironment", "airflow:InvokeRestApi"] },
  { key: "ecs", name: "ECS services and tasks", why: "Sees which tasks behind a failing log group are running, since when and how they start, as evidence before a fix.", actions: ["ecs:ListClusters", "ecs:ListServices", "ecs:DescribeServices", "ecs:DescribeTaskDefinition", "ecs:ListTasks", "ecs:DescribeTasks"] },
  { key: "code", name: "Finding the code behind a log group", why: "Reads function, image and log group tags, the names in a stack's resource list and image manifests to work out which repository a log group's code lives in, so a fix goes to the right repo. Never a function's configuration or code, or a stack's parameters.", actions: ["lambda:ListTags", "logs:ListTagsForResource", "cloudformation:ListStackResources", "ecr:BatchGetImage", "ecr:ListTagsForResource"] },
];

export const UPDATE_STACK = "CoderHelmLogReaderUpdate-3f9a1c2e";

export function permissionsView(
  account: string,
  opts: { missing?: string[]; problem?: { code: string; message: string; fix: string } | null; status?: "error"; region?: string; templateBase?: string } = {},
) {
  const missing = opts.missing ?? [];
  const region = opts.region ?? "us-east-1";
  const status = opts.status ?? (missing.length ? "update_needed" : "up_to_date");
  const base = opts.templateBase ?? "https://coderhelm-public.s3.amazonaws.com/launch/v1.4.0";
  const template = `${base}/coderhelm-log-reader-update.yaml`;
  return {
    account,
    region,
    status,
    method: "simulate",
    checked_at: new Date(Date.now() - 5_000).toISOString(),
    permissions_id: "3f9a1c2e",
    current: true,
    missing_count: missing.length,
    missing: missing.map((a) => {
      const g = GROUPS.find((x) => x.actions.includes(a));
      return { action: a, ability: g?.key ?? null, ability_name: g?.name ?? null };
    }),
    missing_abilities: GROUPS.filter((g) => g.actions.some((a) => missing.includes(a))).map((g) => g.key),
    abilities: GROUPS.map((g) => ({ ...g, missing: g.actions.filter((a) => missing.includes(a)) })),
    update:
      status === "update_needed"
        ? {
            url: `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?stackName=${UPDATE_STACK}&templateURL=${encodeURIComponent(template)}&param_RoleName=CoderHelmLogReader`,
            stack_name: UPDATE_STACK,
            template_url: template,
            sign_in_account: account,
            stacks_url: `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks?filteringText=CoderHelmLogReader`,
          }
        : null,
    problem:
      opts.problem ??
      (status === "error"
        ? { code: "role", message: "Coderhelm couldn't use the role in your AWS account (AccessDenied).", fix: `Check that the CoderHelmLogReader role still exists in account ${account} and trusts this Coderhelm install with your External ID.` }
        : null),
  };
}

export const ECS_MISSING = ["iam:SimulatePrincipalPolicy", "ecs:ListTasks", "ecs:DescribeTasks"];

export function roleGroups() {
  return GROUPS.map(({ key, name, why, actions }) => ({ key, name, why, actions }));
}
