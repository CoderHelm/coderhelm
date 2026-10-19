# coderhelm.com redesign: research notes

Written 2026-10-19 for the redesign PR. Covers the old page, what good developer product sites do, SEO, answer engines (GEO), and the evidence behind every product statement on the new site.

## 1. The old page

- One route held everything. `src/app/page.tsx` was 127 KB and 1,948 lines. The desktop render was 14,640 px tall, with 1,618 DOM elements.
- It had 16 sections in this order: hero, how it works (4 steps), "a team of agents" (9 agent cards), memory knowledge graph (8 cards), "works where you work", AI plans, reviewer, maintain, tests, data sources (with 6 locks), AWS log analyzer, MCP servers, security, open source / pricing, and the final CTA.
- Duplication: "self healing CI" appeared in four sections. Maintenance was explained twice (how it works step 4, then the maintain section). Security appeared twice (data source locks, then the security section). The CTA was repeated three times.
- Nav anchors pointed to `#features`, which did not exist.
- Metadata: one global title and description. Every legal page used the same canonical style without a trailing slash, but the site exports with `trailingSlash: true`. That means canonicals pointed at URLs that redirect.
- The JSON-LD lived only in the root layout. It held one FAQPage with answers that do not match the product (see section 6), and the same graph was injected on every page, legal pages included.
- The sitemap listed 5 URLs, all without trailing slash. Robots allowed everything and named no AI crawler.
- There was no llms.txt and no Markdown version of anything.

Lighthouse, live https://coderhelm.com/ (Lighthouse 12, before):

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Mobile | 83 | 96 | 100 | 100 | 4.6 s | 0 | 80 ms |
| Desktop | 100 | 95 | 100 | 100 | 0.6 s | 0 | 0 ms |

The failures were color contrast, 122 KB of unused JavaScript, and DOM size.

## 2. Teardown of best-in-class sites (fetched 2026-10-19)

Sites reviewed: Linear, Vercel, Stripe, Raycast, Resend, Cursor, Cognition/Devin, Factory, CodeRabbit, Graphite, Greptile, GitHub Copilot. Sweep has pivoted to a JetBrains assistant and its site did not resolve.

How they avoid a feature wall:
- **One promise in the hero, said as a job.** Greptile: "AI agents that review and test pull requests." Cursor: "your coding agent for building ambitious software." Linear: "The product development system for teams and agents."
- **One spine in workflow order.** Linear uses Intake, Plan, Build, Review. CodeRabbit numbers its sections 01 to 04. Greptile shows "How it reviews every PR" in 3 steps.
- **Depth lives elsewhere.** Graphite and Stripe push full feature lists to product pages. On the home page each block is one headline, one visual and one link.
- **Product UI is the proof.** Raycast shows a transcript, GitHub shows an issue with Copilot as the assignee, Cursor shows agent sessions. Greptile links to real public PRs.
- **Boundaries and FAQ.** Resend and Factory say when to use them and when not to. Greptile and Copilot end with an FAQ.
- **Agent readable.** 11 of the 13 publish `/llms.txt` (Raycast and Graphite do not). Vercel serves both `.md` URLs and `Accept: text/markdown`. Resend, Factory and Greptile serve Markdown when it is asked for.

Most of their proof is logos, metrics and testimonials. CoderHelm has none it may use, by the owner's rule. The substitutes are product UI recreated from the dashboard, the security mechanisms stated as facts, and a dated, plain description of exactly what is live.

## 3. SEO

Technical choices in this PR:
- **Metadata on every page.** Each page has its own title, description, canonical (absolute, with trailing slash to match the export), Open Graph and Twitter card, and a `rel="alternate" type="text/markdown"` link. All of it is built from the content source by `pageMetadata()`.
- **JSON-LD on every page.** One `@graph` with Organization, WebSite, SoftwareApplication, WebPage and BreadcrumbList. A page that shows an FAQ also gets FAQPage, generated from the same visible FAQ text.
  - Google stopped showing FAQ rich results in 2026. The markup is kept for meaning only.
  - SoftwareApplication has no rating, because we have no reviews. Google's software rich result needs a rating, so we accept not getting it rather than inventing one.
- **Sitemap.** All 13 pages, with trailing slashes and an updated date. Robots points to it.
- **Semantic HTML.** One `h1` per page, a section per `h2` (each labelled), breadcrumb nav, a skip link, `figure`/`figcaption` for product views, and native `details` elements for the FAQ and the phone menu (no JavaScript).
- **Speed.** The home page has no client components and no images. The product views are HTML and CSS. The old Mermaid, waitlist and analytics client components were deleted (they were unused).

Content plan: one page per real search intent, each with a matching H1, a how-it-works section, a product view and a short FAQ.

| Intent | Page |
|---|---|
| Jira ticket to pull request, GitHub issue to PR | /pull-requests/ |
| AI code review, AI PR reviewer for GitHub | /reviewer/ |
| AI fixes failing CI, AI answers review comments | /maintenance/ |
| CloudWatch alarm to pull request | /alerts/ |
| Flaky test detection | /tests/ |
| Read only database access for AI agents | /data-sources/ |
| Team skills, AGENTS.md, MCP servers | /skills/ |
| Security review by buyers | /security/ |

Comparison pages were left out. Without a factual, dated, sourced comparison they would be guesswork, and the existing comparison results online contradict each other.

## 4. GEO / answer engines

What the evidence says:
- Google states that AI Overviews need nothing beyond normal SEO, with no special files or schema.
- An SE Ranking study of about 300k domains found no measurable citation effect from llms.txt.
- OpenAI and Anthropic state that blocking their search crawlers (OAI-SearchBot, Claude-SearchBot) removes a site from their search answers.

So llms.txt and the Markdown twins are cheap conveniences for agents, not a ranking lever. Crawlability, clear facts and allowing search bots matter more.

What this PR does:
- **One entity sentence**, `SITE.entity`, used word for word in the home page FAQ, the Organization and SoftwareApplication JSON-LD, llms.txt and every Markdown twin.
- **/llms.txt** follows the llmstxt.org format: H1, blockquote, fact list (status, models, integrations, triggers, what it is not), then `## Pages`, `## Get started` and `## Optional` (legal).
- **/llms-full.txt** holds every page in one file.
- **A Markdown twin for every page**: `/index.md`, `/reviewer.md` and so on, generated from the same objects as the HTML.
  - Reachable three ways: the `.md` URL, the `rel="alternate"` link, or `Accept: text/markdown`. A CloudFront viewer request function rewrites to the twin, and a viewer response function adds `Vary: Accept`.
  - The infra deploys `.md` as `text/markdown; charset=utf-8` and llms files as `text/plain; charset=utf-8`.
- **Crawler policy: allow all, on the record.** `robots.ts` names OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, meta-externalagent and CCBot, each with a comment. This is a public marketing site and visibility in assistants is the goal. Training crawlers are allowed too, as a policy choice that is easy to reverse per bot.
- **Citation-friendly facts**: tables for triggers and integrations, exact numbers where they are product facts (3 fix rounds, 8 pushes, 20 green runs, 10 repeat runs, 2 days, 6 hours, 15 minutes, 17 MCP servers), and a visible "Updated" date in the footer and in every twin.

## 5. Page map

| Route | Markdown twin |
|---|---|
| / | /index.md |
| /pull-requests/ | /pull-requests.md |
| /reviewer/ | /reviewer.md |
| /maintenance/ | /maintenance.md |
| /alerts/ | /alerts.md |
| /tests/ | /tests.md |
| /data-sources/ | /data-sources.md |
| /skills/ | /skills.md |
| /security/ | /security.md |
| /contact/, /privacy/, /terms/, /acceptable-use/ | /contact.md, /privacy.md, /terms.md, /acceptable-use.md |
| /llms.txt, /llms-full.txt, /sitemap.xml, /robots.txt | |

The single source of truth is `src/content/site.ts`, plus the legal text in `src/content/legal/*.ts`, which was moved verbatim from the old JSX.

## 6. Claims and the code behind them

Paths: P = coderhelm-platform (main at b54a493), D = coderhelm/dashboard/src/app.

| Claim on the site | Evidence |
|---|---|
| GitHub: assign to CoderHelm, add the `coderhelm` label, or comment `/coderhelm` / `@coderhelm` | P services/gateway/src/routes/github_webhook.rs:278-289, :615-618 |
| Jira: assign or add the `coderhelm` label (configurable); Forge app | P services/gateway/src/routes/jira_webhook.rs:224, :262; P coderhelm-jira/manifest.yml |
| Run stages: triage, plan, implement, security check, conflicts, PR | P services/worker/src/passes/mod.rs:1312, :1399, :1914, :3005, :3156, :3164 |
| Build, lint and tests run in a sandbox with no credentials | P services/worker/src/clients/sandbox.rs:1-11 |
| Up to three self review fix rounds | P services/worker/src/passes/review_pr.rs:1179 (`MAX_SELF_REVIEW_FIX_ROUNDS = 3`) |
| CI fixes cap at 8 pushes and stop when the same failure repeats | P services/worker/src/passes/mod.rs:165 (`MAX_AUTO_FIX_PUSHES = 8`); resume.rs:13-22 |
| Draft PRs marked ready when done | P services/worker/src/passes/pr.rs:246, :328; resume.rs:1947 |
| Works on a `coderhelm/` branch | P services/worker/src/passes/mod.rs:1661 |
| CoderHelm-written PR never merges without a person's approval | P services/gateway/src/routes/alerts.rs:1-12; services/worker/src/passes/await_merge.rs:1-11 |
| Reviewer: label `ch-review` by default, any PR, drafts skipped | P services/gateway/src/routes/reviewer.rs:147; github_webhook.rs:2078-2131 |
| Line comments with GitHub suggestions | P services/worker/src/passes/review_agent.rs:1137 |
| Risk low/medium/high; migrations, auth, secrets and payments always high | P services/worker/src/passes/review_risk.rs:1-6 |
| Re-review on every push; resolves its own fixed comments | P github_webhook.rs:2101; review_pr.rs:993 |
| `@coderhelm` questions, `@coderhelm re-review`, Re-request review button | P github_webhook.rs:363-402, :685 |
| Auto merge off by default, exact reviewed commit, person approves, checks green | P services/worker/src/passes/await_merge.rs:1-11; review_actions.rs:1-14 |
| CI labels from the repo's own labels | P services/worker/src/passes/review_labels.rs:1-17 |
| Require tests option | P review_pr.rs:29, :628 |
| Code graph of definitions and callers | P services/worker/src/passes/code_graph.rs:1-27 |
| Release tags group merges within 15 minutes by default | P review_actions.rs:39-63 (`tag_batch_minutes`) |
| Deploy check after merge (auto merge on), only new failures, never rolls back | P services/worker/src/passes/health_check.rs:1-12 |
| Learns from review ratings with notes | P review_pr.rs:1298-1343 |
| Reads AGENTS.md, CLAUDE.md, copilot instructions, .cursorrules | P services/worker/src/passes/mod.rs:5112-5119 |
| Answers review comments on its PR and pushes fixes | P github_webhook.rs:538-556; services/worker/src/passes/feedback.rs |
| Resolves conflicts with the base branch | P pr.rs:424; feedback.rs:118 |
| E2E failure not caused by the PR is run once more | P services/worker/src/passes/e2e.rs:816-819 |
| Alerts via SNS (CloudWatch, Chatbot, EventBridge, plain), rules pick the repo, unmatched to Teams only, signatures, data not instructions, repeats collapsed, daily caps and token budget | P services/gateway/src/routes/alerts.rs:1-21 |
| Recovery paired with the original alert, resolved card in Teams | P alerts.rs:185, :594-600, :782-869 |
| Log findings every 6 hours, severity, summary, suggested action, one click to a plan, CloudFormation read only role | P infra/lib/log-analyzer-stack.ts:97; lambda/log-analyzer/handler.py:1-12; gateway main.rs:408; infra/cfn/coderhelm-log-reader.yaml |
| Playwright JSON/HTML, JUnit XML, Cucumber JSON | P services/common/src/e2e/parse.rs:1-9 |
| Flaky vs broken vs bad run | P services/common/src/e2e/detect.rs:1-15 |
| PR line per failing test | P e2e.rs:7-9 |
| Quarantine is opt-in, never for broken tests; owner ticket after 2 days by default, team setting 1 to 30 | P detect.rs:14, :367-379; common/src/e2e/model.rs:420-435 (`ticket_after_days`, `DEFAULT_TICKET_AFTER_DAYS = 2`, `TICKET_AFTER_DAYS_RANGE = 1..=30`), platform #172 (66e19fc) |
| Only quarantined tests failing counts as passing: no CI fix, armed auto merge proceeds, PR note names the tests | P services/worker/src/passes/quarantine.rs:1-15; resume.rs:234-264, :1046; await_merge.rs:75-78, :358-372; e2e.rs:1002-1021 (the note) |
| Fix PRs need 20 green runs | P e2e.rs:53-54 |
| Suggested tests pass 10 repeat runs | P e2e.rs:56 |
| Slowest tests, failures grouped by cause | P services/gateway/src/routes/tests.rs:456; common/src/e2e/store.rs:464 |
| Upload with a GitHub Actions token | P services/gateway/src/routes/tests.rs:817-820 |
| Data sources: GraphQL, CloudWatch Logs, PostgreSQL, Redshift | P services/common/src/live/mod.rs:1-23 |
| Read only transaction always rolled back; read only user checked | P common/src/live/db.rs:181, :245, :328-335; redshift.rs:9-11 |
| Role with external ID; CloudShell script | P common/src/live/aws.rs:288, :394 |
| Hidden fields; secrets, emails and cards scrubbed | P common/src/live/redact.rs:57; logs.rs:6-8 |
| Every lookup logged with who, what and which PR | P common/src/live/store.rs:412-424 |
| Custom tools approved per exact version by a second admin | P services/gateway/src/routes/tools.rs:1-7 |
| Skills repo paths, default branch only, text only, never run | P services/common/src/skills.rs:1-13 |
| Synced after every merge | P github_webhook.rs:1973 |
| Per-item switch and read counts | P skills.rs:15-23 (SKILL#, SKILLDAY#) |
| 17 MCP servers (named list) | P services/gateway/src/routes/plugins.rs:47+ (ids figma … sanity) |
| Used in plans and implement | P implement.rs:318; plan.rs:224 |
| Plans stream and turn tasks into issues and runs | P services/gateway/src/routes/plans.rs:1006, :1963 |
| Memory per team and repo; agent profiles; pin, edit, forget, teach | P services/worker/src/memory/mod.rs:22-28; gateway main.rs:529-537; D memory/page.tsx:139-197 |
| Images attached to a ticket are read | P services/worker/src/passes/triage.rs:57-59 |
| Microsoft Teams notifications | P services/common/src/alert_notify.rs:1-8 |
| Release notes to GitHub release, Confluence, email | D releases/page.tsx:70 |
| No git clone: tarball fetched; sandbox copy deleted after build, 1-day expiry | P services/worker/src/clients/github.rs:265; clients/repo_snapshot.rs:1; clients/sandbox.rs:5-7; infra/lib/worker-stack.ts:239-248 |
| Secrets encrypted with AWS KMS; data source secrets team bound | P infra/lib/database-stack.ts:41-67; services/common/src/live/secret.rs:1-5 |
| GitHub webhooks HMAC, SNS signatures | P github_webhook.rs:185; services/gateway/src/routes/sns.rs:1-7 |
| Roles owner, admin, billing, member, viewer | P services/gateway/src/permissions.rs:12 |
| Claude models via the team's own Anthropic key; admins pick models and set a monthly token limit | P services/worker/src/agent/provider.rs:46-56; D settings/models/page.tsx:191; D settings/budget/page.tsx:57 |
| Closed beta with a waitlist | P services/gateway/src/routes/auth.rs:75-100, :194, :1755 |

## 7. Removed from the old site (false or unverifiable)

- **"28+ MCP integrations" including Slack and Datadog.** There are 17, with neither Slack nor Datadog.
- **"Free and open source", "self host it", "Star on GitHub".** The repos are public but have no LICENSE, and there are no self-hosting docs.
- **"Free tier 500K tokens, Pro $199/month"** (in the old JSON-LD). There is no billing in the product.
- **"Source code never cloned to disk or stored."** The sandbox stores a copy for up to a day.
- **"AES-256"**, **"credentials never leave your organization boundary"**, and **"memory cryptographically isolated"**. None is backed by code.
- **"Container per run" for everything.** Only the build sandbox is a container.
- **"Rate limited and audited."** Rate limiting is partial, and only lookups are audited.
- **The "11× fewer repeated mistakes" and "$0.42 cost" figures.** No source.
- **"~5 min average run"** and **"0 pushes to main, ever".** There is no code that enforces the second one.
- **"Get started free"** while sign-up is a closed beta.

## 8. Follow-ups for the owner (not changed here)

- **The legal pages were moved verbatim and are now stale against the product:**
  - The privacy policy (section 1.2) says source code is "never persisted … not written to … object storage". The build sandbox uploads a tarball to S3 for up to a day.
  - The acceptable use policy mentions a free tier with run limits.
  - The legal text says "Coderhelm" while the site now says "CoderHelm", following the GitHub org and the owner's usage.
  - These need a legal edit by the owner.
- **README.md at the repo root** still describes an MCP plugin system with Notion and Slack examples.
- **No real product screenshots are used.** The product views are HTML recreations based on the dashboard, with made up example data.

## 9. Showing many capabilities without a wall (follow-up, 2026-10-19)

The owner's verdict on the first redesign: the headline was weaker than the old "Ship code, not tickets.", and the home page was still a wall of features. Two card grids of six (after the PR, security), a features list and a seven-row table each asked the visitor to read many equal items with no order between them. This section covers how other sites show breadth, what the evidence says, and the structure we chose.

### 9.1 How others show breadth (home pages fetched 2026-10-19)

The fetch tool sees page text, so layout is inferred from markup where noted. Resend and Supabase returned their agent Markdown, not the rendered page. devin.ai returned 404.

| Site | Mechanism | How much at once | Where detail goes |
|---|---|---|---|
| Linear | One product story in workflow order: Intake, Plan, AI, Build/review/ship. One large real UI view per stage | One stage per screen | A page per stage |
| Vercel | Three sections grouped by job (build agents, ship apps, host platforms), each with 4 feature labels and one proof point | About 12 capabilities, no card grid | Product pages |
| Stripe | A 6 tile bento, then sections by audience (startups, platforms, developers), an interactive picker for developers | Segment by segment | Product pages |
| Raycast | 4 category tabs over 17 extension cards, then a 12 screenshot "What else" gallery at the end | One category | The store |
| Notion | Three feature blocks grouped by job (capture, find, automate), each with real screenshots | 3 blocks | /product/features |
| Arc | 4 alternating blocks, one screenshot each; smaller features folded into those blocks | 1 per screen | None |
| Superhuman | Hero video carousel (3), 3 feature blocks, then 5 tabs over 15 icon cards (the wall pattern, behind tabs) | 15 cards | Product pages |
| Cursor | Nearly every capability is one real UI demo (agent sidebar, Slack, model picker, repo list); no card grid | 1 per screen | Docs, changelog |
| Clerk | One section per product with grouped bullet lists (11, 4, 3, 4) and "Explore X →" | One group | A page per product |
| Supabase | 6 products and a "What do you want to do?" table that maps jobs to docs (agent Markdown) | One table | Docs |
| Retool | Almost no features on home: value props, a customer grid, app gallery link | Few | Gallery, product pages |
| Zapier | 3 groups (control, delegation, visibility) holding 13 bullets (weak fetch) | 3 groups | Product pages |
| Datadog | A 9 tile product index, each tile to its own product page | 9 tiles | A page per product |
| GitHub Copilot | 3 stacked rows (desktop app, editor, cloud agent), each a real screenshot and a link; tabs only for pricing and FAQ | 1 per row | Feature pages, docs |
| CodeRabbit | 4 numbered steps (01 Review to 04 Secure) with real UI, then feature blocks, then a compact "more ways" list | 1 step per screen | A page per job |
| Graphite | Video beside a 7 item list, feature rows, a 5 label tab list | Mixed | Product pages |

What repeats across the strongest pages (Linear, Cursor, Copilot, CodeRabbit, Notion): one story told in 3 to 6 large sections, each a single real UI view with one heading and one link, then the long tail in one compact list or gallery. Grouping by job is how Vercel, Notion, Clerk and Zapier show 12 to 22 capabilities without a card wall. Tabs appear mostly for categories (Raycast) or reference content (Copilot pricing and FAQ). Carousels are used for logos, testimonials and news, never for the core story.

### 9.2 Evidence

- **Progressive disclosure.** Show the few most important things first and defer the rest; more than two levels of disclosure usually hurts. https://www.nngroup.com/articles/progressive-disclosure/ For us that means two levels: the home page, then one page per job.
- **Information carrying images beat decoration.** Eye tracking shows people study images that show the real thing and skip decorative ones. https://www.nngroup.com/articles/photos-as-web-content/
- **A list of functions is the weakest approach.** Evil Martians' review of 100+ developer tool landing pages calls a plain feature list "the most straightforward, and weakest" approach and finds problem oriented stories more engaging; tools with a lot of UI lead with it. This counts patterns, it does not measure conversion. https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025
- **Tabs hide what is not default.** Content in non default tabs should be supplementary, not critical; labels should be one or two words; on phones accordions often work better, and five or more tabs push content out of view. https://www.nngroup.com/articles/tabs-used-right/ and https://bux.osu.edu/blog/accordions-vs-tabs
- **Carousels lose later frames.** Use five or fewer, show position, never auto advance on mobile, and repeat important content elsewhere. https://www.nngroup.com/articles/designing-effective-carousels/
- **Scrolljacking disorients.** Most participants were disoriented, worst when text had to be read and on mobile. https://www.nngroup.com/articles/scrolljacking-101/
- **Chunking, not hiding.** More than seven items is fine when they are grouped in a meaningful way, because people recognize rather than recall. https://www.nngroup.com/articles/chunking/
- **Front load headings.** People read the first words of headings and lines most. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
- **Accessible tabs need JavaScript** (roles, arrow keys, one tab in the tab order). https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ Auto moving content over five seconds needs a pause control (WCAG 2.2.2), and interaction motion should respect reduced motion (WCAG 2.3.3).
- **Interactive demo conversion numbers** come only from demo vendors (for example Navattic's "6x"). Treated as marketing, not evidence.
- **Jobs to be done grouping** has no primary conversion study we could find; the support is indirect (chunking, problem oriented stories) plus what leading sites do.

### 9.3 The structure we chose, and why

1. **Hero: "Ship code, not tickets."** The old line, restored, with a tightened version of the old subline. Under it, a strip of the eight steps of the story. It previews the whole product in one glance and every step is a link that jumps to it.
2. **One story, three jobs, eight steps.** "One ticket, followed all the way to production." The steps are grouped by the job they do for a team: *Turn tickets into pull requests* (assign, open the PR), *Keep pull requests healthy after they open* (fix CI, answer review comments, review every PR, merge and check the deploy) and *Catch problems in production* (alerts, flaky tests). Each step is one heading that starts with what happens, one or two sentences, one product view of that moment and one link to the page that holds the detail.
   - Stacked in normal document flow, not tabs or a carousel: every step is critical (tabs guidance), the steps are sequential and distinct (staged disclosure), and stacking works at 375 px with no JavaScript.
   - A sticky rail on wide screens lists the three jobs and eight steps as plain anchor links, so a visitor can jump anywhere, as the owner asked. Where the browser supports scroll driven animations, the rail marks the step crossing the middle of the screen; elsewhere it is plain links. It is a color change, not motion, so it is safe with reduced motion.
   - The same ticket (WEB-412, "Send start date at checkout") runs through the first six views, so the steps read as one story rather than eight features.
3. **A compact bento for what surrounds the work**: read only data lookups, plans, skills and memory, and security, four cells with a small product detail each and a link out. Then one line naming the integrations.
4. **FAQ and one CTA.** The six card security grid, the six card "after the PR" grid and the integrations table left the home page; their content lives on /security/, /maintenance/ and the other job pages, and in llms.txt.

What we did not do: no tabs or carousel for the story (hidden critical content, poor on phones, needs JavaScript for correct keyboard support), no scroll jacking, no autoplay, no new claims (every step restates a claim in section 6), no logos, numbers or testimonials.

### 9.4 Claims used by the new home page

Every statement in the story and the bento maps to a row in section 6: triggers, AGENTS.md, plan with files, `coderhelm/` branch, sandbox with no credentials, three self review rounds, security check, conflicts, CI fixes capped at 8 pushes and stopping on repeats, one rerun of an end to end failure the change did not cause, answering review comments, reviewer label, line suggestions, risk, re-review on push, auto merge off by default on the exact reviewed commit with a person's approval and green checks, deploy check reporting only new failures and never rolling back, SNS alarm routing with rules and paired recoveries, flaky versus broken, opt in quarantine, twenty green runs for fix PRs, read only lookups with recorded activity, plans that become issues and runs, skills, MCP servers, memory, KMS secrets, signed webhooks and roles.
