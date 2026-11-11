"use client";

// The "Infrastructure vulnerabilities" switch on an AWS account: what it
// reads, and when it's on but the role lacks the reads, the one-click update
// with the exact actions it adds. Optional: a role without it never "needs
// an update" for it.

import { Code } from "@/components/settings";
import { linkButton } from "@/components/ui";
import type { AwsAccountAbilities } from "@/lib/api";

/** Every action the option adds, as the role templates grant them. */
export const INFRA_ACTIONS = [
  "ec2:DescribeInstances",
  "ec2:DescribeImages",
  "autoscaling:DescribeAutoScalingGroups",
  "elasticloadbalancing:DescribeTargetGroups",
  "elasticloadbalancing:DescribeLoadBalancers",
  "eks:ListClusters",
  "eks:DescribeCluster",
  "eks:ListNodegroups",
  "eks:DescribeNodegroup",
  "rds:DescribeDBClusters",
  "rds:DescribeDBInstances",
  "rds:DescribePendingMaintenanceActions",
  "elasticache:DescribeServiceUpdates",
  "elasticache:DescribeUpdateActions",
  "es:ListDomainNames",
  "es:DescribeDomains",
  "ecr:DescribeImageScanFindings",
  "ssm:ListInventoryEntries",
  "ssm:GetParameters",
];

export function InfraReadsHelp({ a, on }: { a: AwsAccountAbilities; on: boolean }) {
  const infra = a.infrastructure;
  const row = a.permissions?.abilities.find((x) => x.key === "infra");
  const missing = infra?.missing?.length ? infra.missing : on && infra?.available === false ? (row?.missing.length ? row.missing : INFRA_ACTIONS) : [];
  const update = a.permissions?.update ?? null;
  return (
    <>
      Reads which AMIs, node groups, databases and caches run here, once a day, so Security can say what you have to fix and what AWS patches for you.
      Describe and list calls only. It never reads Lambda function settings, launch template user data or environment variables.
      {on && missing.length > 0 && (
        <span className="mt-2 block rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-200" data-testid="infra-reads-missing">
          Infrastructure vulnerabilities needs {missing.length} more read-only permission{missing.length === 1 ? "" : "s"}.{" "}
          {update ? (
            <>
              An AWS admin signs in to account {update.sign_in_account} and{" "}
              <a href={update.url} target="_blank" rel="noreferrer" className={linkButton}>
                creates the update stack
              </a>
              . It adds:{" "}
            </>
          ) : (
            "The role's update stack adds: "
          )}
          {missing.map((m, i) => (
            <span key={m}>
              <Code>{m}</Code>
              {i < missing.length - 1 ? ", " : "."}
            </span>
          ))}
        </span>
      )}
    </>
  );
}
