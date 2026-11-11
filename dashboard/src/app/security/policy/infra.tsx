"use client";

// Security policy, Infrastructure: the two opt-in sources that depend on the
// team's AWS plan. Amazon Inspector (billed by AWS) replaces Coderhelm's own
// matching for what it covers; AWS Health comes from its API (Business
// Support or higher) or from an EventBridge rule in each account. Each
// change saves at once (PUT /api/security/infrastructure/config).

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Chip } from "@/components/list";
import { SettingsRow, SettingsSection, Switch } from "@/components/settings";
import { focusRing, linkButton } from "@/components/ui";
import { infraApi, type HealthMode, type InfraConfigReply } from "@/lib/infra-security";

const HEALTH: { value: HealthMode; title: string; body: string }[] = [
  { value: "off", title: "Off", body: "Coderhelm matches by version only." },
  { value: "api", title: "Health API (Business Support or higher)", body: "Reads AWS Health events that name your own affected resources." },
  { value: "eventbridge", title: "EventBridge rule in your account", body: "Works on any support plan: a rule in each account forwards the same Health events." },
];

export function InfraPolicySection({ readOnly }: { readOnly: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<InfraConfigReply | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    infraApi.config().then(
      (r) => live && setData(r),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // An older server without these settings: nothing to show.
  if (failed) return null;

  const save = async (next: InfraConfigReply["config"]) => {
    if (!data) return;
    const before = data;
    setData({ ...data, config: next });
    setSaving(true);
    try {
      await infraApi.saveConfig(next);
      toast("Infrastructure settings saved");
    } catch (e) {
      setData(before);
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can change the policy." : "Could not save. Try again.", "error");
    }
    setSaving(false);
  };

  const download = async () => {
    try {
      const text = await infraApi.healthTemplate();
      const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "coderhelm-health-events.yaml";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Could not download the template. Try again.", "error");
    }
  };

  const c = data?.config;
  return (
    <SettingsSection
      id="infrastructure"
      title="Infrastructure"
      description="Optional sources for what runs in your AWS accounts. Both depend on your AWS account, and each change saves at once."
    >
      <div data-testid="infra-policy" aria-busy={!data}>
        <SettingsRow
          label="Amazon Inspector"
          help={
            <>
              When Inspector is on in your accounts, its findings replace Coderhelm&apos;s own matching for the instances, images and functions it covers, and add
              whether an exploit is known and whether the network reaches it.
              <span className="mt-1 block text-amber-200" data-testid="inspector-cost">
                {data?.inspector_cost || "Billed by AWS, not Coderhelm."}
              </span>
            </>
          }
          layout="toggle"
          control={({ labelId, helpId, inputId }) => (
            <Switch
              id={inputId}
              checked={!!c?.inspector}
              onChange={(v) => c && save({ ...c, inspector: v })}
              labelledBy={labelId}
              describedBy={helpId}
              disabled={readOnly || !c || saving}
              testId="infra-inspector"
            />
          )}
        />
        <SettingsRow
          label="AWS Health"
          help={<span data-testid="health-plan">{data?.health_plan || "The Health API needs AWS Business Support or higher."}</span>}
          layout="stacked"
          control={() => (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="AWS Health" className="grid min-w-0 gap-2 sm:grid-cols-3" data-testid="infra-health">
                {HEALTH.map((o) => {
                  const on = c?.health === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={readOnly || !c || saving}
                      onClick={() => c && !on && save({ ...c, health: o.value })}
                      className={`flex min-w-0 flex-col items-start justify-start rounded-lg border p-3 text-left disabled:opacity-60 ${on ? "border-zinc-300 bg-zinc-800/70" : "border-zinc-800 hover:border-zinc-600"} ${focusRing}`}
                      data-testid={`health-${o.value}`}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                        {o.title}
                        {o.value === "eventbridge" && <Chip tone="success">Any plan</Chip>}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-400">{o.body}</span>
                    </button>
                  );
                })}
              </div>
              {c?.health === "eventbridge" && (
                <p className="text-sm text-zinc-300" data-testid="health-template">
                  <button type="button" onClick={download} className={linkButton} data-testid="health-download">
                    Download the CloudFormation template
                  </button>{" "}
                  and upload it in CloudFormation in each account. It only lets the read-only role receive Health events.
                </p>
              )}
            </div>
          )}
        />
      </div>
    </SettingsSection>
  );
}
