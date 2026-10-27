"use client";

import { Suspense } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { ListSkeleton, useListParams } from "@/components/list";
import { DEFAULT_RANGE, Deliveries } from "@/components/deliveries";
import { DeliveryOverview } from "@/components/delivery-overview";
import { Tabs } from "@/components/tabs";

const HEADER = (
  <PageHeader
    title="Deliveries"
    lead="Every webhook Coderhelm receives and every notice it sends, whether it worked, and what to do when it didn't."
  />
);

/** Settings, then Deliveries: webhooks in and notices out, for team admins on every deployment. */
export default function DeliveriesPageGuarded() {
  return (
    <RoleGuard need="integrations">
      <Suspense fallback={<Page>{HEADER}<div className="mt-8"><ListSkeleton rows={6} label="Loading deliveries" /></div></Page>}>
        <DeliveriesPage />
      </Suspense>
    </RoleGuard>
  );
}

const DEFAULTS = { view: "list", source: "all", status: "all", range: DEFAULT_RANGE, q: "", id: "", from: "", until: "", endpoint: "", reason: "", period: "7d" };

/** A tab's address: the source and status filters go along, the rest stays with its view. */
function tabHref(view: "list" | "overview", source: string, status: string): string {
  const q = new URLSearchParams();
  if (view === "overview") q.set("view", "overview");
  if (source !== "all") q.set("source", source);
  if (status !== "all" && !(view === "overview" && status === "pending")) q.set("status", status);
  const s = q.toString();
  return `/settings/deliveries/${s ? `?${s}` : ""}`;
}

function DeliveriesPage() {
  // Filters, the view and the open delivery live in the address, so a view can be shared or reloaded.
  const [params, set] = useListParams(DEFAULTS);
  const overview = params.view === "overview";
  return (
    <Page testId="deliveries-page">
      <div className="mb-2">{HEADER}</div>
      <Tabs
        label="Deliveries views"
        className="mb-6 mt-4"
        value={overview ? "overview" : "list"}
        items={[
          { value: "list", label: "Deliveries", href: tabHref("list", params.source, params.status) },
          { value: "overview", label: "Overview", href: tabHref("overview", params.source, params.status) },
        ]}
      />
      {overview ? (
        <DeliveryOverview
          filters={{ period: params.period, source: params.source, status: params.status, endpoint: params.endpoint }}
          onFilters={(patch) => set(patch)}
        />
      ) : (
        <Deliveries
          filters={{ source: params.source, status: params.status, range: params.range, q: params.q, from: params.from, until: params.until, endpoint: params.endpoint, reason: params.reason }}
          onFilters={(patch, opts) => set(patch, opts)}
          openId={params.id}
          onOpen={(id) => set({ id }, { replace: !id })}
        />
      )}
    </Page>
  );
}
