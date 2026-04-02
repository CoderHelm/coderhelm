export type GtmDataLayerEvent = {
  event: "identify";
  user_id: string;
  team_id: string;
};

declare global {
  interface Window {
    dataLayer: GtmDataLayerEvent[];
  }
}

export function pushToDataLayer(event: GtmDataLayerEvent): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(event);
}
