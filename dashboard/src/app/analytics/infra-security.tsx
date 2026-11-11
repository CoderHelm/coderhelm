"use client";

// Analytics, Security: infrastructure vulnerabilities in numbers (open by
// tier, opened and fixed in 30 days, the median time to fix, pull requests
// and runbook steps, and AWS-managed rows that never count as open). Hidden
// when the server has none of this yet.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/page";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { linkButton } from "@/components/ui";
import { infraApi, type InfraInsights } from "@/lib/infra-security";

export function InfraSecuritySection() {
  const [d, setD] = useState<InfraInsights | null>(null);
  useEffect(() => {
    let live = true;
    infraApi.insights().then(
      (r) => live && setD(r),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  if (!d || (d.open === 0 && d.opened_30d === 0 && d.fixed_30d === 0 && d.aws_managed === 0)) return null;
  const urgent = (d.by_tier.P0 ?? 0) + (d.by_tier.P1 ?? 0);
  return (
    <Section
      title="Infrastructure security"
      id="infra-security"
      description="What runs in your AWS accounts, matched against AWS's bulletins. Over the last 30 days."
      actions={
        <Link href="/security/infrastructure" className={linkButton}>
          See the findings
        </Link>
      }
    >
      <div data-testid="analytics-infra-security">
        <StatGrid>
          <StatTile testId="infra-open" label="Open" value={d.open.toLocaleString()} tone={urgent > 0 ? "danger" : "neutral"} note={`P0 ${d.by_tier.P0 ?? 0}, P1 ${d.by_tier.P1 ?? 0}, P2 ${d.by_tier.P2 ?? 0}, P3 ${d.by_tier.P3 ?? 0}`} />
          <StatTile testId="infra-fixed" label="Fixed" value={d.fixed_30d.toLocaleString()} note={`${d.opened_30d.toLocaleString()} opened`} />
          <StatTile
            testId="infra-time-to-fix"
            label="Median time to fix"
            value={d.median_days_to_fix == null ? "—" : `${d.median_days_to_fix < 1 ? "<1" : Math.round(d.median_days_to_fix * 10) / 10} d`}
            note="Until the fix ran in AWS"
          />
          <StatTile testId="infra-work" label="Fix PRs / steps in AWS" value={`${d.prs_opened_30d} / ${d.runbooks_open}`} note={`${d.aws_managed} AWS-managed, not counted`} />
        </StatGrid>
      </div>
    </Section>
  );
}
