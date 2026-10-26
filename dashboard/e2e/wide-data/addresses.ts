import { REPO } from "./long";
import { ALERT_ID, DRAFT_ID, PLAN_ID, PLUGIN_ID, PLUGIN_RUN_ID, REVIEW_SK, RUN_ID, SUPPORT_TICKET_ID, TEST_ID, TEST_RUN_KEY, TOOL_NAME } from "./ids";

/**
 * The query an item's page (`detail: true` in lib/routes.ts) is opened with,
 * pointing at a record wide-data/ answers. A new item's page needs a line here;
 * another page can have one when its fullest view needs a query.
 */
export const SAMPLE_QUERY: Record<string, string> = {
  "/runs/detail": `?id=${RUN_ID}`,
  "/reviewer/detail": `?sk=${encodeURIComponent(REVIEW_SK)}`,
  // Not an item's page, but its settings form only shows for one repo.
  "/reviewer/config": `?repo=${encodeURIComponent(REPO)}`,
  "/reviewer/pr": `?repo=${encodeURIComponent(REPO)}&pr=12345`,
  "/tests/run": `?key=${encodeURIComponent(TEST_RUN_KEY)}`,
  "/tests/test": `?id=${encodeURIComponent(TEST_ID)}`,
  "/plans/detail": `?id=${PLAN_ID}`,
  "/data-sources/tools/tool": `?name=${encodeURIComponent(TOOL_NAME)}`,
  "/alerts/detail": `?id=${encodeURIComponent(ALERT_ID)}`,
  "/skills/item": `?repo=${encodeURIComponent(REPO)}&path=${encodeURIComponent(".claude/skills/schedule-table-conventions/SKILL.md")}`,
  "/skills/agent": `?repo=${encodeURIComponent(REPO)}&path=${encodeURIComponent(".claude/agents/payments-reconciliation-reviewer.md")}`,
  "/support/ticket": `?id=${SUPPORT_TICKET_ID}`,
  "/brain/knowledge/base": "?id=kb_wide",
  "/knowledge/base": "?id=kb_wide",
  // Not an item's page, but its fullest view is an open thread.
  "/chat": "?thread=th_wide",
  "/plugins/plugin": `?id=${encodeURIComponent(PLUGIN_ID)}`,
  "/plugins/draft": `?id=${DRAFT_ID}`,
  "/plugins/runs": `?id=${PLUGIN_RUN_ID}`,
  // Not an item's page, but its fullest view is a delivery's details.
  "/settings/deliveries": `?id=${encodeURIComponent("github:4f1c2a9e-8b7d-6c5f-4e3d-2c1b0a9f8e7d6c5b4a39")}`,
};
