// The strings that push a phone layout sideways when a page forgets to wrap
// or contain them: unbroken shas, URLs, branch names, file paths, ARNs and
// emails, plus long titles. Every fixture in this folder builds its records
// from these, so each page is drawn with the worst text it will really get.

const now = Date.now();
/** An ISO time `minsAgo` minutes before the spec started. */
export const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
/** Seconds since the epoch, `minsAgo` minutes ago. */
export const epoch = (minsAgo: number) => Math.floor((now - minsAgo * 60_000) / 1000);

export const ORG = "your-team";
export const REPO = "your-team/web-platform-frontend-monorepo-with-a-long-name";
export const REPO_SHORT = REPO.split("/")[1];
export const REPO_2 = "your-team/payments-reconciliation-service-and-nightly-importer";
export const SHA = "4f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39";
export const BRANCH = "coderhelm/web-12345-show-the-class-schedule-on-the-details-page-with-waitlist-badges";
export const PR_URL = `https://github.com/${REPO}/pull/12345`;
export const LONG_URL = `https://github.com/${REPO}/blob/${SHA}/src/app/settings/integrations/components/ConnectionStatusIndicatorWithRetryAndBackoff.tsx#L120-L184`;
export const FILE = "src/app/(dashboard)/settings/integrations/components/ConnectionStatusIndicatorWithRetryAndBackoff.tsx";
export const FILE_2 = "services/payments/reconciliation/src/handlers/nightly_import_with_retries_and_dead_letter_queue.rs";
export const ARN = "arn:aws:iam::123456789012:role/CoderhelmReadOnlyAccessRoleForProductionWorkloadsInUsEast1";
export const LOG_GROUP = "/aws/lambda/payments-reconciliation-service-nightly-importer-production-us-east-1";
export const EMAIL = "dana.developer.with.a.long.address@engineering-platform.example.com";
export const TICKET = "WEBPLATFORM-123456";
export const TITLE =
  "Show the class schedule on the details page, with waitlist badges and a retry when the upstream schedule service times out";
/** One unbroken token, like a stack frame or a minified identifier. */
export const TOKEN = "TypeError:Cannot_read_properties_of_undefined_(reading_'scheduleEntriesForTheSelectedLocationAndDay')";
export const SENTENCE =
  "The retry change is close, but one call can now run twice when the first answer is slow, so the payment can be sent twice.";
/** Markdown with the wide things a body can hold: a table, a code fence, a long link and a long inline token. */
export const MARKDOWN = [
  `## What changed`,
  ``,
  `${SENTENCE} See ${LONG_URL} and \`${FILE}\`.`,
  ``,
  `| File | Lines | Why it changed and what to check when reviewing it |`,
  `| --- | --- | --- |`,
  `| \`${FILE}\` | 120-184 | ${SENTENCE} |`,
  `| \`${FILE_2}\` | 1-40 | ${TOKEN} |`,
  ``,
  "```ts",
  `export async function submitOrderWithRetryAndBackoff(orderId: string, attempt = 0): Promise<SubmitOrderResult> { return await paymentsClient.submit({ orderId, attempt, idempotencyKey: "${SHA}" }); }`,
  "```",
  ``,
  `Branch: \`${BRANCH}\``,
].join("\n");
