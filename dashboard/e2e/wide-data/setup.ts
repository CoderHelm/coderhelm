import type { Handler } from "./index";
import { EMAIL, FILE, FILE_2, LONG_URL, REPO, REPO_2, SENTENCE, TITLE, TOKEN, iso } from "./long";
import { SETUP_RUN_ID } from "./ids";

// Setup: repos with long names in every state, new recommendations with long
// titles, a run whose settings carry long values, evidence, file paths and a
// long text diff, and results with a long error and a draft PR.

const TEXT_NOW = [`Check every handler in ${FILE} validates its input.`, SENTENCE].join("\n");
const TEXT_REC = [`Check every handler in ${FILE} validates its input with the shared schemas.`, SENTENCE, `${TOKEN} is a known failure to watch for.`].join("\n");

const item = (over: Record<string, unknown>) => ({
  current: { value: false, set: false },
  recommended: true,
  source: "detected",
  evidence: [{ text: SENTENCE, file: FILE, line: 120, url: LONG_URL }],
  custom: false,
  risk: "safe",
  ...over,
});

const items = [
  item({ setting_id: "reviewer.enabled", feature: "reviewer", title: TITLE, help: SENTENCE }),
  item({ setting_id: "reviewer.instructions", feature: "reviewer", title: "Review focus", current: { value: TEXT_NOW, set: true }, recommended: TEXT_REC, source: "inferred", custom: true }),
  item({ setting_id: "ci_labels.allow", feature: "ci_labels", title: "Labels it may add", current: { value: [], set: false }, recommended: [TOKEN, "E2E:WEB-PLATFORM-FRONTEND-MONOREPO-SMOKE"] }),
  item({ setting_id: "stale_prs.enabled", feature: "stale_prs", title: "Close stale pull requests", risk: "acts", current: { value: false, set: true }, evidence: [{ text: `Would have closed 2 pull requests, ${SENTENCE}`, url: LONG_URL }] }),
  item({ setting_id: "instructions.coder", feature: "instructions", title: "Coder instructions", current: { value: TEXT_NOW, set: true }, recommended: TEXT_REC, source: "inferred", evidence: [{ text: SENTENCE, file: FILE_2 }] }),
];

export const setupData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/setup") {
    return {
      repos: [
        { repo: REPO, state: "failed", features_on: 3, features_total: 14, last_run_at: iso(60), new_count: 0, custom_count: 0, error: `${TOKEN} ${SENTENCE}` },
        { repo: REPO_2, state: "custom", features_on: 8, features_total: 14, last_run_at: iso(600), new_count: 2, custom_count: 2 },
        { repo: `${REPO}-mobile`, state: "not_set_up", features_on: 0, features_total: 14, last_run_at: null, new_count: 0, custom_count: 0 },
      ],
      new_recommendations: [{ setting_id: "security.enabled", title: TITLE, feature: "security", since: "v0.8.78-rc.20260101.4f1c2a9e" }],
      auto_setup_new_repos: false,
      last_run: { run_id: SETUP_RUN_ID, state: "ready", created_at: iso(5), by: EMAIL },
    };
  }
  if (path === "/api/setup/runs") return { runs: [{ run_id: SETUP_RUN_ID, state: "ready", created_at: iso(5), by: EMAIL, repo_count: 2, changed: 0 }] };
  if (path === `/api/setup/runs/${SETUP_RUN_ID}`) {
    return {
      run_id: SETUP_RUN_ID,
      state: "ready",
      mode: "guided",
      created_at: iso(5),
      by: EMAIL,
      choice: "use_recommended",
      tokens_used: 1_200_000,
      repos: [
        { repo: REPO, state: "ready", items },
        { repo: REPO_2, state: "failed", items: [], error: `${TOKEN} ${SENTENCE}` },
      ],
    };
  }
  return undefined;
};
