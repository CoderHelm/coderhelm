// Infrastructure vulnerabilities as the gateway answers for a made-up team
// running the 2026-160-AWS example: an AL2023 Auto Scaling group behind an
// internet-facing load balancer, an EKS managed node group, an ECS service on
// Fargate, a zip Lambda on python3.12 and an Aurora cluster with an OS update
// pending. Two pull requests, one runbook card, two AWS-managed rows.

const NOW = Date.now();
export const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();

const BULLETIN = { id: "2026-160-AWS", kind: "bulletin", url: "https://aws.amazon.com/security/security-bulletins/2026-160-aws/", severity: "important" };
const ALAS = { id: "ALAS2023-2026-3365", kind: "alas", url: "https://alas.aws.amazon.com/AL2023/ALAS2023-2026-3365.html", severity: "important" };

export const infraFinding = (over: Record<string, unknown> = {}) => ({
  id: "f_asg",
  account: "111122223333",
  region: "us-east-1",
  kind: "auto_scaling_group",
  name: "web-asg",
  group: "web-asg",
  resources: ["web-asg"],
  count: 3,
  title: "Auto Scaling group web-asg runs AMI 2023.12.20261020 (fixed in 2023.12.20261102)",
  cves: ["CVE-2026-98432"],
  sources: [BULLETIN, ALAS],
  severity: "important",
  kev: false,
  exposure: { public: true, why: "behind internet-facing load balancer web-alb" },
  tier: "P1",
  fix: {
    kind: "pr",
    summary: "Point the AMI at AWS's latest AL2023 parameter (now 2023.12.20261102)",
    location: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_launch_template.web", line: 3, how: "tag" },
    from: "2023.12.20261020",
    to: "2023.12.20261102",
    cli: ["aws autoscaling start-instance-refresh --auto-scaling-group-name web-asg --preferences MinHealthyPercentage=90 --region us-east-1"],
    console: "AWS's latest AL2023 AMI in us-east-1 is ami-0latest20261102cc1",
    apply_by: "",
    reason: "",
  },
  status: "open",
  pr: null,
  inspector: null,
  first_seen_at: iso(-30),
  updated_at: iso(-2),
  fixed_at: null,
  ...over,
});

export const INFRA_FINDINGS = [
  infraFinding(),
  infraFinding({
    id: "f_ng",
    kind: "eks_nodegroup",
    name: "prod-ng",
    group: "arn:aws:eks:us-east-1:111122223333:nodegroup/prod/prod-ng/0000",
    resources: ["arn:aws:eks:us-east-1:111122223333:nodegroup/prod/prod-ng/0000"],
    count: 4,
    title: "EKS node group prod-ng runs v20261015 (fixed in v20261031)",
    sources: [BULLETIN],
    exposure: { public: false, why: "nodes in the cluster's subnets (the API endpoint is public)" },
    tier: "P2",
    fix: {
      kind: "pr",
      summary: "Set the node group's release_version to 1.31.4-20261031 (AMI v20261031)",
      location: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_eks_node_group.prod", line: 19, how: "search" },
      from: "1.31.0-20261015",
      to: "1.31.4-20261031",
      cli: ["aws eks update-nodegroup-version --cluster-name prod --nodegroup-name prod-ng --release-version 1.31.4-20261031 --region us-east-1"],
      console: "EKS > Clusters > prod > Compute > prod-ng > Update now",
      apply_by: "",
      reason: "",
    },
    status: "pr_open",
    pr: { number: 412, url: "https://github.com/acme/infra/pull/412", state: "open" },
  }),
  infraFinding({
    id: "f_db",
    kind: "rds_cluster",
    name: "orders",
    group: "arn:aws:rds:us-east-1:111122223333:cluster:orders",
    resources: ["arn:aws:rds:us-east-1:111122223333:cluster:orders"],
    count: 2,
    title: "Aurora cluster orders: operating system update pending",
    // AWS publishes no CVE list for an operating system update: the bulletin
    // that tells RDS customers to patch the database OS is shown as related.
    cves: [],
    sources: [{ id: "system-update:system-update", kind: "maintenance", url: "", severity: "" }, BULLETIN],
    exposure: { public: false, why: "not publicly accessible" },
    tier: "P2",
    fix: {
      kind: "runbook",
      summary: "Apply the operating system update in AWS (`system-update`)",
      location: null,
      from: "16.4",
      to: "",
      cli: [
        "aws rds apply-pending-maintenance-action --resource-identifier arn:aws:rds:us-east-1:111122223333:db:orders-1 --apply-action system-update --opt-in-type next-maintenance --region us-east-1",
      ],
      console: "RDS console, Region us-east-1 > Databases > select `orders-1` > Actions > Patch at next window (or Patch now).",
      decision: "This cannot be expressed in code. No code change is needed and none causes drift.",
      meaning: "os_update",
      advisory_note:
        "AWS publishes no CVE list for this action. Bulletin 2026-160-AWS (2026-10-30) tells customers of this service to patch the database operating system; AWS does not say this pending update is that patch.",
      apply_by: "2026-12-01",
      reason: "New Operating System update is available",
    },
  }),
  infraFinding({
    id: "f_fargate",
    kind: "ecs_fargate_service",
    name: "api",
    group: "arn:aws:ecs:us-east-1:111122223333:service/prod-ecs/api",
    resources: ["arn:aws:ecs:us-east-1:111122223333:service/prod-ecs/api"],
    count: 3,
    title: "ECS service api on Fargate: AWS-managed (2026-160-AWS)",
    sources: [BULLETIN],
    exposure: { public: true, why: "behind internet-facing load balancer web-alb" },
    tier: null,
    fix: {
      kind: "aws",
      summary: "AWS-managed, nothing to do",
      location: null,
      from: "",
      to: "",
      cli: [],
      console: "",
      apply_by: "",
      reason:
        "AWS patched Fargate: tasks started after 2026-11-01 17:00 run patched. Some of this service's tasks started before then (the oldest 2026-10-28); AWS retires them per the service's task retirement settings. Force a new deployment to replace them sooner.",
    },
    status: "aws_managed",
  }),
  infraFinding({
    id: "f_lambda",
    kind: "lambda_function",
    name: "thumbs",
    group: "aws_lambda_function.thumbs",
    resources: ["aws_lambda_function.thumbs"],
    count: 1,
    title: "Lambda thumbs: AWS-managed (2026-160-AWS)",
    sources: [BULLETIN],
    exposure: { public: false, why: "Lambda functions have no inbound ports" },
    tier: null,
    fix: {
      kind: "aws",
      summary: "AWS-managed, nothing to do",
      location: null,
      from: "",
      to: "",
      cli: [],
      console: "",
      apply_by: "",
      reason: "Lambda workloads are not affected by this issue. Lambda functions do not have public IPv4 TCP ports. No action is required on your part.",
    },
    status: "aws_managed",
  }),
];

export const INFRA_ACCOUNTS = [
  {
    account: "111122223333",
    region: "us-east-1",
    on: true,
    available: true,
    missing: [] as string[],
    update_url: null as string | null,
    read: { read_at: iso(-3), resources: 7, errors: [] as unknown[] },
  },
];

export const ACCOUNT_MISSING = {
  account: "444455556666",
  region: "eu-west-1",
  on: true,
  available: false,
  missing: ["ec2:DescribeInstances", "ec2:DescribeImages", "eks:DescribeNodegroup", "rds:DescribePendingMaintenanceActions"],
  update_url: "https://console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/quickcreate?stackName=CoderHelmLogReaderUpdate-1a2b3c4d-kb5e6f70&param_InfrastructureVulnerabilities=on",
  read: null,
};

export const infraOverview = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  dry_run: false,
  counts: { open: 3, p0: 0, p1: 1, p2: 2, p3: 0, prs: 2, runbooks: 1, aws_managed: 2, fixed_30d: 4 },
  accounts: INFRA_ACCOUNTS,
  findings: INFRA_FINDINGS,
  read_at: iso(-3),
  ...over,
});

export const INFRA_FEEDS = [
  { feed: "alas2023", name: "Amazon Linux 2023 advisories", read_at: iso(-5), count: 3135, fresh: true, error: null, error_at: null },
  { feed: "alas2", name: "Amazon Linux 2 advisories", read_at: iso(-5), count: 4080, fresh: true, error: null, error_at: null },
  { feed: "bottlerocket", name: "Bottlerocket advisories", read_at: iso(-5), count: 1842, fresh: true, error: null, error_at: null },
  {
    feed: "bulletins",
    name: "AWS security bulletins",
    read_at: iso(-29),
    count: 43,
    fresh: false,
    error: "none of 43 bulletin pages could be read (the page format may have changed)",
    error_at: iso(-5),
  },
  { feed: "lambda_runtimes", name: "Lambda runtime deprecations", read_at: iso(-5), count: 56, fresh: true, error: null, error_at: null },
  { feed: "latest_images", name: "AWS latest AMI parameters", read_at: iso(-5), count: 9, fresh: true, error: null, error_at: null },
];

export const INFRA_RESOURCES = [
  {
    id: "web-asg",
    kind: "auto_scaling_group",
    name: "web-asg",
    account: "111122223333",
    region: "us-east-1",
    group: "web-asg",
    count: 3,
    source: "aws",
    versions: {
      ami_id: "ami-0web20261020aaaa1",
      ami_name: "al2023-ami-2023.12.20261020.0-kernel-6.1-x86_64",
      ami: { os: "al2023", flavor: "al2023", release: "2023.12.20261020", date: "20261020", kernel_line: "6.1" },
    },
    exposure: { public: true, why: "behind internet-facing load balancer web-alb" },
    tags: { Name: "web", Repo: "acme/infra" },
    pending: [],
    defined_in: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_launch_template.web", line: 3, how: "tag" },
    seen_at: iso(-3),
    findings: ["f_asg"],
  },
  {
    id: "arn:aws:eks:us-east-1:111122223333:nodegroup/prod/prod-ng/0000",
    kind: "eks_nodegroup",
    name: "prod-ng",
    account: "111122223333",
    region: "us-east-1",
    group: "arn:aws:eks:us-east-1:111122223333:nodegroup/prod/prod-ng/0000",
    count: 4,
    source: "aws",
    versions: {
      node_release: "1.31.0-20261015",
      k8s_version: "1.31",
      ami_type: "AL2023_x86_64_STANDARD",
      ami: { os: "al2023", flavor: "eks", release: "v20261015", date: "20261015", kernel_line: "" },
    },
    exposure: { public: false, why: "nodes in the cluster's subnets (the API endpoint is public)" },
    tags: { "coderhelm:cluster": "prod" },
    pending: [],
    defined_in: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_eks_node_group.prod", line: 19, how: "search" },
    seen_at: iso(-3),
    findings: ["f_ng"],
  },
  {
    id: "arn:aws:rds:us-east-1:111122223333:cluster:orders",
    kind: "rds_cluster",
    name: "orders",
    account: "111122223333",
    region: "us-east-1",
    group: "arn:aws:rds:us-east-1:111122223333:cluster:orders",
    count: 2,
    source: "aws",
    versions: { engine: "aurora-postgresql", engine_version: "16.4" },
    exposure: { public: false, why: "not publicly accessible" },
    tags: {},
    pending: [{ kind: "system-update", name: "system-update", description: "New Operating System update is available", apply_by: "2026-12-01", auto_applied_after: "", status: "pending" }],
    defined_in: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_rds_cluster.orders", line: 46, how: "search" },
    seen_at: iso(-3),
    findings: ["f_db"],
  },
  {
    id: "arn:aws:ecs:us-east-1:111122223333:service/prod-ecs/api",
    kind: "ecs_fargate_service",
    name: "api",
    account: "111122223333",
    region: "us-east-1",
    group: "arn:aws:ecs:us-east-1:111122223333:service/prod-ecs/api",
    count: 3,
    source: "aws",
    versions: {
      launch_type: "FARGATE",
      platform_version: "1.4.0",
      oldest_task_started: iso(-14 * 24),
      image: "111122223333.dkr.ecr.us-east-1.amazonaws.com/api:1.42.0",
      image_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
    exposure: { public: true, why: "behind internet-facing load balancer web-alb" },
    tags: { "coderhelm:cluster": "prod-ecs" },
    pending: [],
    defined_in: null,
    seen_at: iso(-3),
    findings: [],
  },
  {
    id: "iac:acme/infra:envs/prod/main.tf:aws_lambda_function.thumbs",
    kind: "lambda_function",
    name: "thumbs",
    account: "111122223333",
    region: "us-east-1",
    group: "aws_lambda_function.thumbs",
    count: 1,
    source: "iac",
    versions: { runtime: "python3.12", package_type: "Zip" },
    exposure: { public: false, why: "Lambda functions have no inbound ports" },
    tags: {},
    pending: [],
    defined_in: { repo: "acme/infra", file: "envs/prod/main.tf", address: "aws_lambda_function.thumbs", line: 37, how: "search" },
    seen_at: iso(-3),
    findings: [],
  },
];

export const INFRA_INSIGHTS = {
  open: 3,
  by_tier: { P0: 0, P1: 1, P2: 2, P3: 0 },
  opened_30d: 7,
  fixed_30d: 4,
  median_days_to_fix: 3.5,
  prs_opened_30d: 3,
  runbooks_open: 1,
  aws_managed: 2,
};

// ── Databases: why a pull request or a runbook, where the code is ───────
// One Aurora cluster with an upgrade (a pull request on the module call's
// input), a patch and an operating system update pending at once; a database
// whose code CoderHelm is not sure of; and one a fix run's change was refused
// on. Made-up names throughout.

const DOC = "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_UpgradeDBInstance.Maintenance.html";
const LEDGER = "arn:aws:rds:us-east-1:111122223333:cluster:ledger-prod-aurora";

const dbFinding = (over: Record<string, unknown>) =>
  infraFinding({
    kind: "rds_cluster",
    name: "ledger-prod-aurora",
    group: LEDGER,
    resources: [LEDGER],
    count: 2,
    cves: [],
    sources: [],
    severity: "medium",
    exposure: { public: false, why: "not publicly accessible" },
    tier: "P3",
    environment: "production",
    ...over,
  });

export const DB_UPGRADE = dbFinding({
  id: "f_db_upgrade",
  title: "Aurora cluster ledger-prod-aurora: engine version upgrade to 16.6 pending",
  sources: [{ id: "db-upgrade:db-upgrade", kind: "maintenance", url: "", severity: "" }],
  fix: {
    kind: "pr",
    summary: "Raise `engine_version` to 16.6 in envs/prod/main.tf",
    location: {
      repo: "acme/infra",
      file: "modules/aurora/main.tf",
      address: "module.ledger.aws_rds_cluster.this",
      line: 4,
      how: "terraform_module",
      tool: "terraform",
      confidence: "high",
      evidence: ["`cluster_identifier` is `ledger-prod-aurora`, the live name (from `name` in envs/prod/main.tf)", "`engine` is `aurora-postgresql`"],
      edit: { file: "envs/prod/main.tf", line: 4, attribute: "engine_version", value: "16.4", via: "module_input" },
      environment: "production",
    },
    from: "16.4",
    to: "16.6",
    cli: [],
    console: "",
    apply_by: "",
    reason: "Upgrade to Aurora PostgreSQL 16.6",
    decision:
      "A pull request: an engine version change has a code equivalent, and the code that defines this resource was found. Found by a Terraform module call and its inputs (confidence: high).",
    meaning: "engine_upgrade",
    order: [
      "1 of 3 pending on this database (with the engine patch and the operating system update). AWS gives no order for these; this order is CoderHelm's.",
      "This is production. The same update is open on `ledger-staging-aurora` (staging): do that first, check it, then this one.",
    ],
    after: ["f_db_staging"],
    advisory_note: "The pending action carries no CVE list. A CVE is named here only when an AWS bulletin ties it to this engine and target version.",
    notes: {
      attribute: ["Change `engine_version` on the `aws_rds_cluster`. Never raise it on an `aws_rds_cluster_instance`."],
      takes_effect: ["`apply_immediately` defaults to `false`: after apply the upgrade is queued for the cluster's next maintenance window."],
      interruption: ["A minor version upgrade restarts the cluster."],
      replacement: ["`engine_version` updates in place. The provider documents `cluster_identifier` as forcing a new cluster."],
      never_change: ["cluster_identifier"],
      prechecks: [{ text: "Confirm the target is a valid upgrade from the running version.", cli: "aws rds describe-db-engine-versions --engine aurora-postgresql --engine-version 16.4 --region us-east-1" }],
      backup: [],
      rollback: ["Upgrades are one-way. Reverting the version in code is not a rollback: it asks for a downgrade."],
      traps: ["Never set a value below the live version."],
      plan: ["CoderHelm ran no plan: it holds no cloud credentials."],
      pipeline: [],
      order: [],
      validation: [],
      sources: [{ url: "https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/rds_cluster.html.markdown", reviewed_on: "2026-11-13" }],
      stale: false,
    },
  },
});

export const DB_PATCH = dbFinding({
  id: "f_db_patch",
  title: "Aurora cluster ledger-prod-aurora: engine patch to 16.4.3 pending",
  sources: [{ id: "system-update:engine-patch", kind: "maintenance", url: "", severity: "" }],
  fix: {
    kind: "runbook",
    summary: "Apply the engine patch to 16.4.3 in AWS (`system-update`)",
    location: {
      repo: "acme/infra",
      file: "modules/aurora/main.tf",
      address: "module.ledger.aws_rds_cluster.this",
      line: 4,
      how: "terraform_module",
      tool: "terraform",
      confidence: "high",
      evidence: [],
      environment: "production",
    },
    from: "16.4",
    to: "16.4.3",
    cli: [`aws rds apply-pending-maintenance-action --resource-identifier ${LEDGER} --apply-action system-update --opt-in-type next-maintenance --region us-east-1`],
    console: "RDS console, Region us-east-1 > Databases > select the cluster `ledger-prod-aurora` > Actions > Patch at next window (or Patch now).",
    apply_by: "2026-12-01",
    reason: "Upgrade to Aurora PostgreSQL 16.4.3",
    decision:
      "This cannot be expressed in code. The Aurora PostgreSQL engine version in the API is major.minor; the patch is a third digit. The resource is defined in `modules/aurora/main.tf` (`module.ledger.aws_rds_cluster.this`) in acme/infra; nothing there changes for this update.",
    meaning: "engine_patch",
    order: ["2 of 3 pending on this database (with the engine version upgrade and the operating system update). AWS does not say whether this patch is still offered after the engine version upgrade."],
    advisory_note: "The pending action carries no CVE list. A CVE is named here only when an AWS bulletin ties it to this engine and the patch's version.",
    runbook: {
      scope: ["AWS account 111122223333, Region us-east-1.", `Aurora cluster \`ledger-prod-aurora\` (${LEDGER}).`, "AWS action `system-update`: engine patch."],
      what: ["An Aurora PostgreSQL engine patch. On a cluster ARN `system-update` means \"patch the DB engine for Aurora PostgreSQL\"."],
      interruption: ["With zero-downtime patching the writer keeps most connections: a drop in throughput of a few seconds, at most about one minute. Readers restart."],
      prerequisites: ["The person running this needs `rds:ApplyPendingMaintenanceAction` on this cluster."],
      prechecks: [{ text: "Confirm the patch is still pending and read its description and dates.", cli: `aws rds describe-pending-maintenance-actions --resource-identifier ${LEDGER} --region us-east-1` }],
      backup: [{ text: "Take a manual cluster snapshot first.", cli: "aws rds create-db-cluster-snapshot --db-cluster-identifier ledger-prod-aurora --db-cluster-snapshot-identifier ledger-prod-aurora-before-system-update-20261113 --region us-east-1" }],
      console: ["RDS console, Region us-east-1 > Databases > select the cluster `ledger-prod-aurora` > Actions > Patch at next window (or Patch now)."],
      steps: [
        { text: "Schedule the patch for the cluster's next maintenance window.", cli: `aws rds apply-pending-maintenance-action --resource-identifier ${LEDGER} --apply-action system-update --opt-in-type next-maintenance --region us-east-1` },
      ],
      validation: [{ text: "The patch shows in `SELECT aurora_version();`.", cli: "" }],
      rollback: [{ text: "A scheduled patch that has not started can be cancelled with `undo-opt-in`; an immediate opt-in can't be undone.", cli: `aws rds apply-pending-maintenance-action --resource-identifier ${LEDGER} --apply-action system-update --opt-in-type undo-opt-in --region us-east-1` }],
      apply_by: "2026-12-01",
      if_nothing: ["An action with an apply date is applied by AWS in the cluster's maintenance window after that date."],
      notes: [],
      sources: [
        { url: DOC, reviewed_on: "2026-11-13" },
        { url: "https://docs.aws.amazon.com/cli/latest/reference/rds/apply-pending-maintenance-action.html", reviewed_on: "2026-01-02", stale: true },
      ],
      stale: true,
    },
  },
});

export const DB_UNSURE = dbFinding({
  id: "f_db_unsure",
  kind: "rds_instance",
  name: "terraform-20240311094512345600000001",
  group: "arn:aws:rds:us-east-1:111122223333:db:terraform-20240311094512345600000001",
  resources: ["arn:aws:rds:us-east-1:111122223333:db:terraform-20240311094512345600000001"],
  count: 1,
  environment: "",
  title: "RDS instance terraform-20240311094512345600000001: engine version upgrade to 16.6 pending",
  sources: [{ id: "db-upgrade:db-upgrade", kind: "maintenance", url: "", severity: "" }],
  fix: {
    kind: "runbook",
    summary: "Apply the engine version upgrade to 16.6 in AWS (`db-upgrade`)",
    location: {
      repo: "acme/infra",
      file: "db/main.tf",
      address: "aws_db_instance.a",
      line: 2,
      how: "terraform_generated_name",
      tool: "terraform",
      confidence: "low",
      evidence: ["the live name is one Terraform generated (`terraform-` and a timestamp), and this block sets no identifier", "1 other place fits about as well; CoderHelm cannot tell them apart without Terraform's state"],
      candidates: ["acme/infra:db/main.tf aws_db_instance.b"],
    },
    from: "16.4",
    to: "16.6",
    cli: ["aws rds modify-db-instance --db-instance-identifier terraform-20240311094512345600000001 --engine-version 16.6 --no-apply-immediately --region us-east-1"],
    console: "",
    apply_by: "",
    reason: "Upgrade to 16.6",
    decision: "This change has a code equivalent, but CoderHelm is not sure where this resource is defined, so it opens no pull request.",
    meaning: "engine_upgrade",
    code_note: "If this resource is defined in code, raise its pinned version there to the new version once this is applied.",
  },
});

// The guard tripped twice: the pull request is a draft and the row fell back
// to its runbook.
export const DB_REFUSED = dbFinding({
  ...DB_UPGRADE,
  id: "f_db_refused",
  name: "audit-prod-aurora",
  title: "Aurora cluster audit-prod-aurora: engine version upgrade to 16.6 pending",
  pr: { number: 418, url: "https://github.com/acme/infra/pull/418", state: "draft" },
  refused: ["modules/aurora/main.tf, line 5: `aws_rds_cluster.this` changes `cluster_identifier`, which replaces the resource (a new one is created and this one is destroyed)."],
  drafted: true,
  note: "The pull request is kept as a draft with the reason at the top of its description, and is never merged as it is. Nothing was applied.",
  fix: {
    ...(DB_UPGRADE.fix as Record<string, unknown>),
    kind: "runbook",
    decision:
      "A runbook: CoderHelm's own code change for this update would have replaced or destroyed a resource that holds data, twice, so its pull request is a draft and the update is applied in AWS. CoderHelm makes no further attempt until the code that defines the resource or the update's target changes.",
    notes: null,
    runbook: {
      ...((DB_PATCH.fix as unknown as { runbook: Record<string, unknown> }).runbook),
      steps: [{ text: "Upgrade the cluster in its next maintenance window.", cli: "aws rds modify-db-cluster --db-cluster-identifier audit-prod-aurora --engine-version 16.6 --no-apply-immediately --region us-east-1" }],
    },
  },
});

// The guard tripped once: one fix round is correcting the change.
export const DB_FIXING = dbFinding({
  ...DB_UPGRADE,
  id: "f_db_fixing",
  name: "billing-prod-aurora",
  title: "Aurora cluster billing-prod-aurora: engine version upgrade to 16.6 pending",
  status: "fixing",
  pr: { number: 419, url: "https://github.com/acme/infra/pull/419", state: "open" },
  refused: ["modules/aurora/main.tf, line 5: `aws_rds_cluster.this` changes `cluster_identifier`, which replaces the resource (a new one is created and this one is destroyed)."],
  drafted: false,
  note: "CoderHelm read its own change and it would have replaced or destroyed a resource that holds data. One fix round is correcting the lines below; the change is read again when it ends.",
});

export const INFRA_DATABASES = [DB_UPGRADE, DB_PATCH, DB_UNSURE, DB_REFUSED, DB_FIXING];
