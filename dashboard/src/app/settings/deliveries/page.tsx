"use client";

import { Suspense } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { ListSkeleton, useListParams } from "@/components/list";
import { DEFAULT_RANGE, Deliveries } from "@/components/deliveries";

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

function DeliveriesPage() {
  // Filters and the open delivery live in the address, so a view can be shared or reloaded.
  const [params, set] = useListParams({ source: "all", status: "all", range: DEFAULT_RANGE, q: "", id: "" });
  return (
    <Page testId="deliveries-page">
      <div className="mb-6">{HEADER}</div>
      <Deliveries
        filters={{ source: params.source, status: params.status, range: params.range, q: params.q }}
        onFilters={(patch, opts) => set(patch, opts)}
        openId={params.id}
        onOpen={(id) => set({ id }, { replace: !id })}
      />
    </Page>
  );
}
