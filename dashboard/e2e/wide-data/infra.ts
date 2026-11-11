import type { Handler } from "./index";
import { FILE, REPO, SENTENCE, TOKEN } from "./long";
import { INFRA_FEEDS, INFRA_INSIGHTS, INFRA_RESOURCES, infraFinding, infraOverview, ACCOUNT_MISSING } from "../infra-data";

// Infrastructure vulnerabilities: findings, resources and accounts with long
// names, ARNs, AMI names, CLI commands and file paths, for the
// no-sideways-scroll spec.

const LONG_ARN = "arn:aws:eks:us-east-1:111122223333:nodegroup/production-platform-cluster-us-east-1/general-purpose-nodes-with-a-long-name/0ac1d2e3-f4a5-b6c7-d8e9-f0a1b2c3d4e5";
const LOC = { repo: REPO, file: `infrastructure/terraform/environments/production/us-east-1/${FILE.replace(/\//g, "-")}.tf`, address: "module.platform_cluster.aws_eks_node_group.general_purpose_nodes_with_a_long_name", line: 1234, how: "search" };

const wide = (over: Record<string, unknown>) =>
  infraFinding({
    name: "general-purpose-nodes-with-a-long-name",
    group: LONG_ARN,
    resources: [LONG_ARN, `${LONG_ARN}-second`],
    title: `EKS node group general-purpose-nodes-with-a-long-name runs v20261015 (fixed in v20261031): ${SENTENCE}`,
    cves: ["CVE-2026-98432", "CVE-2026-1234567", "CVE-2026-7654321"],
    exposure: { public: true, why: `behind internet-facing load balancer ${TOKEN}` },
    ...over,
  });

const findings = [
  wide({ id: "w_pr", kind: "eks_nodegroup", fix: { ...infraFinding().fix, location: LOC, summary: `Set the node group's release_version to 1.31.4-20261031: ${TOKEN}`, cli: [`aws eks update-nodegroup-version --cluster-name production-platform-cluster-us-east-1 --nodegroup-name general-purpose-nodes-with-a-long-name --release-version 1.31.4-20261031 --region us-east-1`] } }),
  wide({ id: "w_rb", kind: "rds_cluster", tier: "P2", fix: { ...infraFinding().fix, kind: "runbook", location: null, apply_by: "2026-12-01", console: `RDS > Databases > ${TOKEN} > Maintenance & backups > Pending maintenance > Apply`, cli: [`aws rds apply-pending-maintenance-action --resource-identifier ${LONG_ARN} --apply-action system-update --opt-in-type next-maintenance --region us-east-1`] } }),
  wide({ id: "w_aws", kind: "ecs_fargate_service", tier: null, status: "aws_managed", fix: { ...infraFinding().fix, kind: "aws", location: null, cli: [], reason: `${SENTENCE} ${TOKEN}` } }),
];

const resources = INFRA_RESOURCES.map((r) => ({ ...r, id: `${r.id}-${TOKEN}`, name: `${r.name}-with-a-long-name-${TOKEN}`, defined_in: r.defined_in ? LOC : null }));

export const infraData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/security/infrastructure") return infraOverview({ findings, accounts: [...infraOverview().accounts, ACCOUNT_MISSING] });
  if (path === "/api/security/infrastructure/sources") return { feeds: INFRA_FEEDS.map((f) => (f.error ? { ...f, error: `${f.error} ${TOKEN}` } : f)) };
  if (path === "/api/security/infrastructure/resources") return { accounts: [ACCOUNT_MISSING], resources, count: resources.length };
  if (path === "/api/security/infrastructure/insights") return INFRA_INSIGHTS;
  if (path === "/api/security/infrastructure/config")
    return { config: { inspector: true, health: "eventbridge" }, inspector_cost: `Billed by AWS: about $1.25 per instance a month. ${TOKEN}`, health_plan: `${SENTENCE} ${TOKEN}` };
  return undefined;
};
