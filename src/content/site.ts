import type { Page } from "./types";
import terms from "./legal/terms";
import privacy from "./legal/privacy";
import acceptableUse from "./legal/acceptable-use";
import contact from "./legal/contact";

// Every product statement on this site describes behavior that is live in the
// platform today. The PR that introduced this file lists the code reference
// behind each one. Keep it that way: if a feature is not shipped, it is not here.

export const SITE = {
  name: "CoderHelm",
  alternateNames: ["Coderhelm", "Coder Helm"],
  url: "https://coderhelm.com",
  appUrl: "https://app.coderhelm.com",
  docsUrl: "https://docs.coderhelm.com",
  installUrl: "https://docs.coderhelm.com/self-host/install/",
  email: "support@coderhelm.com",
  // "Talk to us about moving": the site has no contact form, so moving from
  // the hosted service to a self-hosted install starts as an email to support
  // with the topic in the subject. A person answers; there is no automatic
  // migration tool.
  moveUrl: "mailto:support@coderhelm.com?subject=Moving%20to%20self-hosted%20CoderHelm",
  tagline: "An engineering platform for GitHub and Jira: tickets, pull requests, review, alerts and releases.",
  // The one sentence that defines the product, used word for word in the home
  // page, the meta description, JSON-LD and llms.txt.
  entity:
    "CoderHelm is an engineering platform for GitHub and Jira. Assign it an issue or a ticket and it opens a pull request in your repository, then it stays on the code: it answers review comments, fixes its own failing CI, reviews your team's pull requests and turns production alerts into fixes that a person approves. Teams can also ask it about their code and documents in Chat, and run it hosted or in their own AWS account.",
  llmsDetails: [
    "Status: the hosted service is in open beta. Anyone can sign up at https://app.coderhelm.com; a team's admins choose who may join that team.",
    "Self-hosting: runs in your own AWS account as one CloudFormation stack, installed from the browser at https://docs.coderhelm.com/self-host/install/ or from a terminal. Releases are published at https://github.com/CoderHelm/coderhelm-platform/releases. One press of Update installs the newest release, or it installs itself in a maintenance window, on the Stable channel or the nightly Beta channel. Updates never wait for an AWS admin: extra permissions a release can use are a separate, optional step. Admins are emailed only when they need to act or something went wrong, plus an optional weekly digest. A hybrid install makes one choice for the whole install: CoderHelm's apps (easiest, the default) or fully private. With CoderHelm's apps, Jira, Notion, Confluence, Google Drive, Figma and every app CoderHelm adds later work with no setup; a tool with its own app set up always uses it, and GitHub has its own choice. License: FSL-1.1-ALv2 (each release becomes Apache 2.0 two years after it ships).",
    "Models: Claude. Hosted teams use their own Anthropic API key; self-hosted installs use Amazon Bedrock in their own account or each team's Anthropic API key. Admins can set monthly token limits: one for new tokens, one for cache reads and one for cache writes.",
    "Chat: answers questions about the team's repositories and knowledge. It reads the code itself (overview, files, code search, code graph) and cites real file paths and lines. It looks up Jira tickets, pull requests and runs, and \"what needs my answer?\" lists everything waiting on you.",
    "App map: a plain-English map of how a team's app fits together across all its repositories, made with the open-source Floorplan project (MIT): its parts, the screens and what is behind each one, web requests matched to the endpoints that answer them across repositories, and the outside services each part uses. CoderHelm adds its recent runs and its open findings to the map, answers questions about it in numbered steps, and keeps it current with every push, describing only new or changed files again.",
    "Knowledge sources: Notion, Confluence, Google Drive, Sanity, GitHub, websites and uploaded files, kept in sync. Import the knowledge base you already have: an S3 bucket, a Bedrock knowledge base's documents, or a Notion or Confluence export. Or connect it in place, searched live with nothing copied: an Amazon Bedrock knowledge base in your AWS account, or any search tool your team runs through its MCP server.",
    "API: a public REST API with team API keys, described at https://docs.coderhelm.com/openapi.json. Outbound webhooks tell your systems what CoderHelm did, signed the Standard Webhooks way and retried for about a day.",
    "Logs: reads the CloudWatch log groups you choose through a read only role every six hours, lists what it finds, and can open a fix pull request for new findings on its own.",
    "Works with: GitHub (GitHub App), Jira (Forge app), Microsoft Teams, AWS (CloudWatch alarms through SNS, CloudWatch Logs, PostgreSQL, Redshift), GraphQL APIs, Playwright, JUnit and Cucumber reports, and 17 MCP servers.",
    "Starts a run when: a GitHub issue is assigned to CoderHelm, gets the `coderhelm` label, or gets a `/coderhelm` or `@coderhelm` comment; a Jira ticket is assigned to CoderHelm or gets the `coderhelm` label.",
    "Reviews any pull request that gets the review label (`ch-review` by default) once a repository turns the reviewer on.",
    "Setup: the first item in the dashboard's left menu. Do it for me reads each repository and turns on a recommended value for every setting, labelled detected, inferred or default with its evidence. It keeps settings someone already chose, starts anything that closes or merges as a preview, and any change or a whole run can be undone. New recommendations from a release never turn themselves on.",
    "Infrastructure vulnerabilities: off until an admin switches it on for a connected AWS account. Once a day, and again when the page is opened more than five minutes after the last read, it reads, read only, the AMIs, kernels, EKS node groups, databases, caches and OpenSearch domains running there, and matches them by version against AWS's security bulletins and the Amazon Linux and Bottlerocket advisories, with no model. Findings follow live AWS: they close as fixed when the fix is running and as removed when the resource is gone. Each fix is a pull request in the code that defines the resource, a database update CoderHelm applies in AWS only after an admin approves it, a runbook step in AWS for a person to run, or AWS-managed and never counted as open.",
    "Runtime vulnerabilities: CoderHelm reads which Java version a team runs (from Dockerfile images, version files, build settings, CI setup and Lambda declarations) and matches it against Java's own advisories, so a JDK bug becomes a finding with a fix, not only bugs in libraries.",
    "Previews: when a change shows in the browser, CoderHelm finds the pull request's preview wherever the host publishes it, proves each acceptance criterion with an end to end test that fails on staging and passes on the preview, and adds screenshots of the changed pages at desktop and phone width to the pull request.",
    "Sign in: email and password, Google, GitHub or Microsoft. A team can also sign in with its own Okta, set up by an admin in Settings; on CoderHelm's cloud each email domain is proved with a DNS record first. Admins can require two factor sign in.",
    "Stale pull requests: off by default. Once a team turns it on, CoderHelm marks a pull request stale after 7 days with no activity from a person and closes it 7 days later if nothing happened, with a comment that says how to reopen. Its own comments and other bots never count as activity; exempt labels, drafts, chosen authors and pull requests CoderHelm is working on are never touched; it starts in Preview only and keeps the branch.",
    "Learning: it scores its own work from what happens next (a pull request merged as written or edited, closed or reverted; CI passing on the first try or needing fixes; review comments acted on or dismissed; thumbs up or down), reads the best and worst past examples from the repository before a change or a review, and turns justified pushback on a review into a lesson. Lessons, memories, examples and behavior changes are listed with their evidence, and admins can delete or turn off any of them.",
    "Not: a code editor or IDE plugin. It works through issues, tickets and pull requests.",
  ],
  featureList: [
    "GitHub issue to pull request",
    "Jira ticket to pull request",
    "AI code review on any GitHub pull request",
    "Stale pull request cleanup that warns before it closes and never counts bot noise",
    "Code reviews that show every step they took and a file by file overview",
    "Fixes failing CI on its own pull requests",
    "Answers review comments and pushes fixes",
    "Learns from pull request outcomes, CI results and review feedback",
    "Reads its best and worst past work in a repository before it writes",
    "Lessons and memories your admins can read, edit and delete",
    "CloudWatch alarm to pull request through SNS",
    "Flaky test detection and quarantine",
    "Read only lookups in GraphQL APIs, CloudWatch Logs, PostgreSQL and Redshift",
    "Team skills and agent briefs read from a repository",
    "AI plans that turn a description into ordered issues",
    "Chat that reads your repositories and cites file paths and lines",
    "Knowledge from Notion, Confluence, Google Drive, Sanity, GitHub, websites and files",
    "Import your knowledge base from S3, a Bedrock knowledge base or a Notion or Confluence export, or connect Bedrock or any MCP search tool in place",
    "Ask a knowledge base on its own page, with passages only search and usage",
    "Repository setup that recommends every setting with its reason, keeps yours and can undo any change",
    "Infrastructure vulnerability checks for AMIs, kernels, EKS nodes, databases and caches on AWS",
    "Vulnerabilities in the Java runtime a team runs, not only in its libraries",
    "Web changes proven on the pull request's preview with end to end tests and screenshots",
    "Sign in with Google, GitHub, Microsoft or your team's Okta",
    "Agent permissions: allow, ask or deny, with approvals",
    "Custom roles and monthly token limits",
    "Public REST API with team API keys",
    "Signed outbound webhooks, retried for about a day",
    "CloudWatch Logs analysis that opens fix pull requests",
    "Self-hosting in your own AWS account",
  ],
  sameAs: ["https://github.com/CoderHelm"],
  ctaNote: "CoderHelm is in open beta. Sign up and bring your own Anthropic API key.",
  updated: "2026-11-20",
  updatedLabel: "November 20, 2026",
  year: 2026,
} as const;

// The home page makes three claims and links to the page behind each:
// it turns a ticket into a pull request, it stays on that pull request, and
// it runs in your own AWS account. Everything else lives on its own page.
const home: Page = {
  slug: "",
  path: "/",
  navLabel: "Home",
  title: "CoderHelm: an engineering platform for GitHub and Jira",
  description:
    "Assign a GitHub issue or Jira ticket and get a pull request. Then CoderHelm keeps the code healthy: it fixes its CI, answers review comments, reviews PRs, turns alerts into fixes and answers questions about your code.",
  h1: "An engineering platform for your tickets, pull requests, alerts and releases.",
  lede:
    "CoderHelm works on GitHub and Jira, from the ticket to the pull request, its review, the alerts after it ships and the release. Run it on CoderHelm's cloud or in your own AWS account.",
  sections: [
    {
      id: "platform",
      heading: "What the platform does",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Tickets to pull requests", text: "Assign a GitHub issue or Jira ticket and it opens a pull request, fixes its failing checks and answers review comments until a person merges it.", href: "/pull-requests/", shot: "homeRun" },
            { title: "Code review", text: "It reviews any pull request your team labels, not only its own, and comments on the lines that need a change.", href: "/reviewer/", shot: "homeReview" },
            { title: "Alerts", text: "A production alarm becomes a read of the likely cause and a fix pull request that a person approves.", href: "/alerts/", shot: "homeAlert" },
            { title: "Releases", text: "After merges it tags the release and writes notes your team can read, in the GitHub release, Confluence or email.", href: "/maintenance/", shot: "homeRelease" },
            { title: "Chat and knowledge", text: "Ask about your code and documents, and the answer cites the files and lines it came from.", href: "/chat/", shot: "homeChat" },
            { title: "App map", text: "A plain map of how your app fits together across its repositories, kept current with every push.", href: `${SITE.docsUrl}/concepts/app-map/`, shot: "homeAppMap" },
          ],
        },
      ],
    },
    {
      id: "how-it-works",
      heading: "From ticket to pull request",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "It reads before it writes", text: "The ticket, your `AGENTS.md` and the code around the change. Then it writes a plan that names the files it will touch." },
            { title: "It works on its own branch", text: "Every change goes on a `coderhelm/` branch. It never pushes to main." },
            { title: "It checks its own work", text: "It runs your build, lint and tests in a sandbox that holds no credentials, then reviews its own diff." },
            { title: "A person merges", text: "The pull request says what changed, why, and how to check it. Merging is your call." },
          ],
        },
        { type: "actions", items: [{ label: "What happens during a run", href: "/pull-requests/" }] },
      ],
    },
    {
      id: "a-real-one",
      heading: "An example pull request",
      blocks: [
        {
          type: "p",
          text: "An early run on this website's own repository. The issue asked for analytics with the ID in an environment variable. The review asked for the opposite, and CoderHelm made the change in the thread.",
        },
        {
          type: "pr",
          pr: {
            repo: "CoderHelm/coderhelm",
            number: 7,
            title: "Add GA4 gtag.js to Next.js marketing site",
            href: "https://github.com/CoderHelm/coderhelm/pull/7",
            facts: "Opened March 30, 2026 from [issue #2](https://github.com/CoderHelm/coderhelm/issues/2). Two files, four commits, checks passing, merged the same day.",
            thread: [
              { who: "nambok", file: "src/components/GoogleAnalytics.tsx", text: "this is not a sensitive value it should be G-XTM8Y82LX9 please hardcode" },
              { who: "coderhelm[bot]", bot: true, file: "src/components/GoogleAnalytics.tsx", text: "Done — hardcoded `G-XTM8Y82LX9` directly and removed the `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var reference and its null guards." },
              { who: "nambok", file: ".env.example", text: "we should remove this too no?" },
              { who: "coderhelm[bot]", bot: true, file: ".env.example", text: "Done — deleted `.env.example`." },
            ],
            commits: [
              { sha: "1e64791", time: "19:36", who: "coderhelm[bot]", text: "feat: add GA4 gtag.js to Next.js marketing site (#2)" },
              { sha: "076b836", time: "19:37", who: "coderhelm[bot]", text: "fix: move GA measurement ID to env variable, guard against missing value" },
              { sha: "5d56569", time: "19:50", who: "coderhelm[bot]", text: "hardcode GA measurement ID, remove env var guard" },
              { sha: "5b016f4", time: "19:51", who: "coderhelm[bot]", text: "remove .env.example" },
            ],
          },
        },
        {
          type: "p",
          text: "Its other merged pull requests in that repository are [listed on GitHub](https://github.com/CoderHelm/coderhelm/pulls?q=is%3Apr+author%3Aapp%2Fcoderhelm+is%3Amerged).",
        },
      ],
    },
    {
      id: "after-the-pull-request",
      heading: "After the pull request opens",
      blocks: [
        {
          type: "table",
          head: ["When", "What it does"],
          rows: [
            ["A check fails", "It reads the failing step's log and pushes a fix. A job that failed once and passed on a rerun is left alone. It stops when the same failure repeats, and after eight pushes at most."],
            ["A reviewer asks for a change", "It replies in the thread, pushes the commit and says what changed, as in the pull request above."],
            ["The base branch moves on", "It merges the base in, resolves the conflicts and checks that its own change is still the same."],
            ["Someone merges it", "It follows the change to the deploy it starts and reports only failures that are new since the merge."],
          ],
        },
        { type: "actions", items: [{ label: "Maintenance before and after the merge", href: "/maintenance/" }] },
      ],
    },
    {
      id: "self-host",
      heading: "Run it in your own AWS account",
      blocks: [
        {
          type: "p",
          text: "Self hosted, your code, tickets, logs and model calls stay in your account. The install guide sets it up from your browser and checks each step against your install as it runs.",
        },
        {
          type: "table",
          head: ["", ""],
          rows: [
            ["Install", "One CloudFormation stack"],
            ["Models", "Claude on Amazon Bedrock in your account, or your Anthropic API key"],
            ["Updates", "One press of Update, or on their own in your maintenance window. Each release's signature is checked before anything runs."],
            ["License", "FSL-1.1-ALv2. Each release becomes Apache 2.0 two years after it ships."],
            ["Releases", "[github.com/CoderHelm/coderhelm-platform](https://github.com/CoderHelm/coderhelm-platform/releases)"],
          ],
        },
        {
          type: "actions",
          items: [
            { label: "Open the install guide", href: SITE.installUrl },
            { label: "More about self-hosting", href: "/self-host/" },
          ],
        },
      ],
    },
    {
      id: "more",
      heading: "What else it does",
      blocks: [
        {
          type: "list",
          items: [
            "[Reviews any pull request](/reviewer/) you label, not only its own",
            "[Turns production alarms into fixes](/alerts/) a person approves",
            "[Fixes vulnerable packages](/security-fixes/) your code actually calls",
            "[Keeps flaky tests from failing builds](/tests/)",
            "[Answers questions about your code](/chat/) with file and line citations",
            "[Closes stale pull requests](/stale-pull-requests/), with a warning first",
          ],
        },
        { type: "note", text: `Open beta. Bring your own Anthropic API key. [Full documentation](${SITE.docsUrl}).` },
      ],
    },
  ],
};

const setup: Page = {
  slug: "setup",
  path: "/setup/",
  navLabel: "Setup",
  title: "Set up every repository in one click, with the reason for each setting",
  description:
    "CoderHelm's Setup reads each repository, recommends a value for every setting with the evidence behind it, keeps the settings you already chose, starts anything that closes or merges as a preview, and can undo any change.",
  h1: "Repository setup",
  lede:
    "CoderHelm reads each repository the way a new teammate would: its tests, workflows, labels, branch protection, agent notes and recent pull requests. Then it turns on the settings that fit how the repository already works, says why for each one, and leaves the ones you chose alone.",
  heroFrame: { id: "setup", caption: "A Setup run: what it turned on for a repository with the evidence for each, and a preview waiting to be switched on." },
  sections: [
    {
      id: "how",
      heading: "How it works",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Pick the repositories", text: "Open Setup, the first item in the left menu, and pick the repositories. The token estimate shows before anything starts, and a run that doesn't fit what is left of your monthly limits can't start." },
            { title: "It reads each one", text: "Every setting gets a recommendation with where it came from and the evidence beside it, with a link to the file when there is one. Reading changes nothing." },
            { title: "It turns them on", text: "Do it for me applies the recommendations at once. Or choose Review each setting to see every value first and pick Use, Keep or Edit for each." },
          ],
        },
      ],
    },
    {
      id: "reasons",
      heading: "Where each recommendation comes from",
      blocks: [
        {
          type: "table",
          head: ["Label", "Meaning", "For example"],
          rows: [
            ["Detected", "Read straight from the repository or GitHub", "The test runner in `package.json`, the workflows that run end to end tests, the labels a workflow reacts to, branch protection and its required checks, `CODEOWNERS`, `AGENTS.md`"],
            ["Inferred", "A judgment from those facts and the last 50 merged pull requests", "The review focus, whether to require tests, coder instructions, which CI labels to add, when a pull request counts as stale"],
            ["Default", "Nothing in the repository says otherwise", "CoderHelm's own default"],
          ],
        },
        { type: "p", text: "It sets up the reviewer, stale pull requests, tests, security fixes and workflow settings. It changes CoderHelm's own settings only and opens no pull requests in your repositories." },
      ],
    },
    {
      id: "safe",
      heading: "Changes you approve",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Keeps your settings", text: "Keep my settings is on by default: a setting someone already chose stays as it is. Switching it off reads Replace mine with recommended, and the page warns you before you start." },
            { title: "Previews for anything that closes or merges", text: "Closing stale pull requests starts in Preview only, and auto merge stays off until you pick it yourself. Each shows what it would have done over the last 14 days. Switch on makes it real in one click." },
            { title: "Undo one setting or a whole run", text: "On the results, Undo next to a change puts that one setting back, and Undo this run puts back everything the run changed. A setting someone changed again since is left as it is and listed." },
            { title: "Custom stays custom", text: "A setting changed by hand after Setup applied it is marked Custom, and later runs leave it alone unless you choose to replace it." },
            { title: "Retry what failed", text: "A repository that fails shows its reason on its row, and one button runs again for the failed repositories only." },
            { title: "Every change on the record", text: "Each run, each change and each undo is written to the audit log." },
          ],
        },
        { type: "shot", shot: "setupResults", caption: "The results of a Do it for me run: two previews to switch on, with what each would have done, then each change with its evidence and Undo. Example data." },
      ],
    },
    {
      id: "new",
      heading: "New recommendations",
      blocks: [
        {
          type: "p",
          text: "When a CoderHelm release adds a recommendation, Setup lists it under New recommendations and the left menu shows a badge, which also counts repositories not set up yet. Nothing new turns itself on: review it on every repository or dismiss it for the whole team.",
        },
        {
          type: "list",
          items: [
            "A newly connected repository starts as Not set up",
            "Set up new repos on their own, off by default, applies the choices from your last reviewed run to new repositories and lists what it changed",
            "The reviewer, stale pull request, tests, security, workflow, instructions and alerts settings pages mark a value Recommended or Custom, and most link back with Review in Setup",
          ],
        },
        { type: "actions", items: [{ label: "How Setup works in the docs", href: "https://docs.coderhelm.com/getting-started/setup/" }] },
      ],
    },
    {
      id: "setup-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Will it overwrite settings we already chose?", a: "No, not unless you ask it to. Keep my settings is on by default, and when you switch it off the page lists each value it would replace and asks before it applies." },
            { q: "Can it turn on auto merge on its own?", a: "No. Auto merge is only recommended where branch protection requires checks, and no choice turns it on for you, not even Use recommended everywhere. It stays off until you pick it." },
            { q: "Who can run it?", a: "Admins, and anyone whose [custom role](https://docs.coderhelm.com/concepts/roles/) may run Setup. Each change also needs the permission its own settings page needs; a setting you can't change is marked with the permission it needs and stays as it is." },
            { q: "Does it cost tokens?", a: "Reading uses tokens from your team's monthly budget. The estimate shows before it starts, and next to what it has used while it reads." },
          ],
        },
      ],
    },
  ],
  related: ["reviewer", "stale-pull-requests", "tests"],
};

const pullRequests: Page = {
  slug: "pull-requests",
  path: "/pull-requests/",
  navLabel: "Tickets to PRs",
  title: "GitHub issue and Jira ticket to pull request",
  description:
    "Assign a GitHub issue or Jira ticket to CoderHelm and it plans the change, writes it on its own branch, runs your build and tests, reviews its own work and opens a pull request.",
  h1: "Tickets to pull requests",
  lede:
    "Assign the ticket to CoderHelm or add a label. It reads the repository, plans the change, writes it, runs your build and tests, reviews its own work and opens a pull request your team can review like any other.",
  heroFrame: { id: "run", caption: "A run in the CoderHelm dashboard: each stage from triage to the opened pull request, with the files it changed." },
  sections: [
    {
      id: "triggers",
      heading: "Start a run from the tools you already use",
      blocks: [
        {
          type: "table",
          head: ["Where", "How to start a run"],
          rows: [
            ["GitHub issue", "Assign it to CoderHelm, add the `coderhelm` label, or comment `/coderhelm` or `@coderhelm`."],
            ["Jira ticket", "Assign it to CoderHelm or add the `coderhelm` label. Your admin can change the label."],
            ["CoderHelm dashboard", "Describe the work in a plan and approve it; each task becomes an issue and a run."],
            ["Monitoring alert", "Route a CloudWatch alarm to CoderHelm and a matching rule starts a run. See [alerts](/alerts/)."],
          ],
        },
      ],
    },
    {
      id: "stages",
      heading: "What happens during a run",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Triage and plan", text: "It reads the ticket, the repository's conventions and your AGENTS.md, then writes a plan with the files it will touch." },
            { title: "Implement and test", text: "It writes the change on a `coderhelm/` branch and runs your real build, lint and tests in a sandbox that holds no credentials." },
            { title: "Review and open", text: "It reviews its own work, runs a security check, resolves conflicts with the base branch and opens the pull request." },
            { title: "Prove it on the preview", text: "When the change shows in the browser, it finds the pull request's preview wherever your host publishes it, runs an end to end test for each acceptance criterion (it must fail on staging and pass on the preview), and adds screenshots of the changed pages at desktop and phone width. See [previews](https://docs.coderhelm.com/concepts/previews/)." },
          ],
        },
        { type: "p", text: "Pull requests open as drafts while the work is in progress, and are marked ready for review when CoderHelm is done." },
      ],
    },
    {
      id: "plans",
      heading: "Plans: describe the work, get ordered tickets",
      blocks: [
        {
          type: "p",
          text: "In the dashboard, describe what you want to build. CoderHelm streams a plan as it reasons, searching your code and the MCP servers you connected for the details. Approve it and each task becomes a GitHub issue and a run, in order. Each task's state follows its runs and pull requests, the plan lists what needs you, and it is done only when every task merged.",
        },
      ],
    },
    {
      id: "pr-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Can CoderHelm read screenshots attached to a ticket?", a: "Yes, images attached to the ticket are read along with its text." },
            { q: "Will the pull request follow our conventions?", a: "It reads AGENTS.md, CLAUDE.md, copilot instructions and .cursorrules from the repository, plus the guardrails, custom instructions and team voice your admins set." },
            { q: "What if CI fails on the pull request?", a: "It reads the failing check's logs, fixes the cause and pushes again. It stops when the same failure happens twice, so it never loops on a problem it cannot fix. See [maintenance](/maintenance/)." },
          ],
        },
      ],
    },
  ],
  related: ["maintenance", "reviewer", "skills"],
};

const reviewer: Page = {
  slug: "reviewer",
  path: "/reviewer/",
  navLabel: "Code review",
  title: "AI code review for GitHub pull requests",
  description:
    "Add a label to any GitHub pull request and CoderHelm reviews it with the context of the whole repository, comments on exact lines with suggested fixes, rates risk and reviews again on every push.",
  h1: "Code review",
  lede:
    "Turn the reviewer on for a repository and add the review label (`ch-review` by default) to any pull request. CoderHelm reviews it like an engineer who knows the codebase, and keeps reviewing as you push.",
  heroFrame: { id: "review", caption: "A CoderHelm review on GitHub: a risk level with the reason, a line comment with a suggested fix, and earlier comments resolved after they were fixed." },
  sections: [
    {
      id: "what",
      heading: "What a review includes",
      blocks: [
        {
          type: "list",
          items: [
            "Context beyond the diff: a code graph of definitions and callers shows what a change reaches",
            "Comments on the exact lines, with GitHub suggestions you can apply",
            "A risk level of low, medium or high; migrations, auth, secrets and payments always rate high",
            "Changes are requested only for a named correctness, security or data loss problem, with where it is and the evidence; everything else is a note on the approval",
            "CI read the way GitHub shows it: check runs and commit statuses, so CI outside GitHub Actions counts",
            "GitHub Code Quality findings already open on the changed files are never reported twice, and a change that fixes them says so",
            "A new review on every push, and its own comments resolved once they are fixed",
            "Edit the description to answer a review and it reviews the same commit again",
            "Answers in the thread: `@coderhelm` with a question, `@coderhelm re-review`, or the Re-request review button",
            "A CoderHelm review check on the commit from the moment a review is scheduled, naming what holds the merge and linking to a page that follows the review step by step",
            "Draft pull requests are skipped until they are marked ready",
          ],
        },
      ],
    },
    {
      id: "options",
      heading: "Options a repository can turn on",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Auto merge, only when safe", text: "Off by default. Merges only the exact commit it reviewed, after a person approves and every check is green." },
            { title: "Runs the right CI", text: "Adds the labels your CI listens for, such as which end to end suites to run or a staging deploy, based on what the pull request changes. It uses the labels your repository already describes." },
            { title: "Holds the line on tests", text: "Sends back pull requests that change behavior without new or updated tests, and says what to test and where." },
            { title: "Release tags", text: "Tags a release after merges, grouping merges that land close together (within 15 minutes by default)." },
            { title: "Deploy check", text: "With auto merge on, it waits for the deploy checks after the merge and reports only failures that are new. It never rolls back a shared branch." },
            { title: "Learns from your team", text: "Rate a review and add a note. Later reviews on that repository follow the feedback, on top of AGENTS.md and your review instructions." },
            { title: "Closes stale pull requests", text: "Off by default. After 7 days with no activity from a person it adds a stale label and warns; 7 days later, if nothing happened, it closes the pull request and says how to reopen. Its own comments and bots never count, and it starts in Preview only, which lists what it would mark and close.", href: "/stale-pull-requests/" },
          ],
        },
      ],
    },
    {
      id: "review-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Does it review pull requests written by people?", a: "Yes. Any pull request with the review label is reviewed, whoever wrote it." },
            { q: "Can it merge on its own?", a: "Only if you turn on auto merge for the repository, and even then only the exact commit it reviewed, after a person approves and every check passes." },
            { q: "Where do I see past reviews?", a: "The Reviewer page in the dashboard lists every review with its ratings, and lets you review a pull request on demand." },
            { q: "Will it close a pull request someone still needs?", a: "Only after a warning and a grace period with no activity from a person, and never one with an exempt label like `keep-open` or `security`, a draft, or one CoderHelm is still working on. Comment `@coderhelm keep open`, push or remove the stale label to keep it. Closing keeps the branch, and reopening picks it back up. See [stale pull requests](/stale-pull-requests/)." },
          ],
        },
      ],
    },
  ],
  related: ["stale-pull-requests", "maintenance", "tests"],
};

const stalePrs: Page = {
  slug: "stale-pull-requests",
  path: "/stale-pull-requests/",
  navLabel: "Stale pull requests",
  title: "Close stale pull requests without losing work",
  description:
    "CoderHelm marks a pull request stale after 7 days with no activity from a person, warns on it, and closes it 7 days later if nothing happened. Bot comments never count, it starts in Preview only and the branch is kept.",
  h1: "Stale pull requests",
  lede:
    "Old pull requests pile up and hide the ones that matter. CoderHelm finds the ones no person has touched in weeks, warns on them, and closes them only if nothing happens, with a comment that says how to reopen.",
  heroFrame: { id: "stale", caption: "A quiet pull request: the stale label and the warning, a bot comment that does not count as activity, and the close a week later with the branch kept." },
  sections: [
    {
      id: "how",
      heading: "How it decides",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Quiet for 7 days", text: "A pull request with no activity from a person for 7 days gets the `stale` label and a warning comment that says how to keep it open." },
            { title: "Grace period of 7 days", text: "Any activity in that time takes the label off on its own, and so does a person removing the label." },
            { title: "Closed, with a way back", text: "If nothing happened, it closes the pull request with a comment that says how to reopen. The commits and the conversation stay, and the branch is kept." },
          ],
        },
        { type: "p", text: "It looks at the open pull requests of each repository the reviewer is on for, about once an hour. Both numbers, the label and both comments are settings." },
      ],
    },
    {
      id: "activity",
      heading: "Bot comments are not activity",
      blocks: [
        {
          type: "p",
          text: "Activity is read from the pull request's timeline, not from its last updated time, which every bot comment and label moves. So its own warning never counts as activity, and neither do other bots.",
        },
        {
          type: "table",
          head: ["Counts as activity", "Never counts"],
          rows: [
            ["A commit, including CoderHelm's own", "CoderHelm's warning, its label and its other comments"],
            ["A force push", "Comments and commits from other bots"],
            ["A person's comment, review or review comment", "CI runs"],
            ["A person changing a label, requesting a review, changing the draft state or reopening", "Pushes to the base branch"],
          ],
        },
      ],
    },
    {
      id: "never",
      heading: "Pull requests it leaves alone",
      blocks: [
        {
          type: "list",
          items: [
            "Pull requests with an exempt label: `keep-open`, `pinned`, `security` and `do-not-close` by default, and you choose the list",
            "Drafts, unless you turn that off",
            "Pull requests by authors you list, people or bots",
            "A pull request a CoderHelm run is working on, one it will check again on its own, or one auto merge is waiting to merge",
            "Any pull request someone kept open, from the dashboard or with `@coderhelm keep open`",
            "With **Only CoderHelm's own** chosen, every pull request CoderHelm didn't open",
          ],
        },
      ],
    },
    {
      id: "safe",
      heading: "Defaults",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Off by default", text: "Nothing happens until an admin turns it on." },
            { title: "Starts in Preview only", text: "The mode is Off, Preview only or On. In Preview only the dashboard lists what would be marked and closed, and when, under Would mark or close, and nothing changes on GitHub until you pick On. Check now works the list out again at any time." },
            { title: "Keep open, anywhere", text: "Comment `@coderhelm keep open`, push a commit, comment or remove the label. The author or anyone with write access can keep a pull request open." },
            { title: "The branch is kept", text: "Closing keeps the branch unless you choose to delete it, and even then never a fork's branch, the default branch or a branch another pull request is based on." },
            { title: "Closes are capped", text: "At most 10 closes per repository each hour by default, writes one at a time, and it waits out GitHub's rate limit." },
            { title: "Every action listed", text: "Each pull request marked, closed, un-staled or kept open is listed in the dashboard with the reason." },
          ],
        },
      ],
    },
    {
      id: "settings",
      heading: "Your team's settings, or one repository's",
      blocks: [
        {
          type: "p",
          text: "Set it once for every repository, and give any repository its own settings. Both comments are yours to edit: leave one empty for the default, and the days and the label are filled in for you. See the [docs](https://docs.coderhelm.com/getting-started/stale-pull-requests/) for every setting.",
        },
        {
          type: "faq",
          items: [
            { q: "Will it close a pull request someone still needs?", a: "Only after a warning and 7 more days with no activity from a person, and never one that is exempt. A comment, a push or `@coderhelm keep open` keeps it." },
            { q: "What happens when someone reopens it?", a: "It is treated like any other open pull request: reopening counts as activity, so the stale label comes off and it won't be marked again until it has gone the full quiet period (7 days by default) without activity." },
            { q: "Does it need new GitHub permissions?", a: "No. It uses the permissions the CoderHelm GitHub App already has, and needs the permission to change contents only if you turn on deleting branches." },
          ],
        },
      ],
    },
  ],
  related: ["reviewer", "maintenance", "pull-requests"],
};

const maintenance: Page = {
  slug: "maintenance",
  path: "/maintenance/",
  navLabel: "Maintenance",
  title: "AI that fixes failing CI and answers review comments",
  description:
    "CoderHelm stays on the code after the pull request: it answers review comments, fixes failing CI on its pull requests, resolves merge conflicts, checks deploys after merge and writes release notes.",
  h1: "Maintenance",
  lede:
    "Opening a pull request is where most AI tools stop. CoderHelm keeps working on it until it is merged, and keeps watching the code after that.",
  heroFrame: { id: "maintain", caption: "The timeline of one CoderHelm pull request: a check it fixed, a review comment it answered, the merge and the deploy check after it." },
  sections: [
    {
      id: "before-merge",
      heading: "Until the pull request is merged",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Answers review comments", text: "Request changes or ask a question on its pull request. It replies, pushes the fix and says what changed." },
            { title: "Fixes failing CI", text: "When a check fails on its pull request, it reads the logs, fixes the cause and pushes again. It stops when the same failure repeats, and caps automatic pushes at eight. When only [quarantined tests](/tests/) failed, it treats the run as passing instead." },
            { title: "Keeps the branch current", text: "Resolves merge conflicts with the base branch before it works on feedback, so a pull request does not go stale while it waits." },
            { title: "Tells your failures from its own", text: "When an end to end test fails for a reason the pull request did not cause, it runs it once more and says so, with the evidence." },
            { title: "One pull request for the work", text: "When its own open pull request already covers a ticket, the run continues in it and says what it carried over. A person's pull request is never touched." },
            { title: "Never a silent draft", text: "A finished run's pull request is marked ready, or stays a draft with each reason and what to do, shown on the run page." },
            { title: "Waits out GitHub's limits", text: "When GitHub's hourly limit is reached, runs and reviews wait for the reset and continue, and the run page says when." },
          ],
        },
      ],
    },
    {
      id: "after-merge",
      heading: "After the merge",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Checks the deploy", text: "With auto merge on, it waits until the deploy checks finish and reports only failures that are new compared with before the merge. It never rolls back a shared branch." },
            { title: "Turns alerts into fixes", text: "Production alarms routed to CoderHelm become analyzed pull requests in the right repository.", href: "/alerts/" },
            { title: "Fixes what's reachable", text: "Advisories your code actually reaches get a fix pull request and a deadline. The rest wait for a weekly batch instead of flooding you with pull requests.", href: "/security-fixes/" },
            { title: "Keeps tests healthy", text: "Flaky tests stop blocking builds, broken ones are never hidden, and fix pull requests come with proof.", href: "/tests/" },
            { title: "Writes release notes", text: "Tags releases after merges and writes notes your team can read, published to the GitHub release, Confluence or email." },
          ],
        },
      ],
    },
    {
      id: "maint-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Does CoderHelm fix CI on pull requests it did not write?", a: "It fixes failures on its own pull requests. On your team's pull requests the reviewer explains failures, and for end to end tests it says whether a failure is known flaky, a bad run or likely caused by the change." },
            { q: "Can it loop forever on a failing check?", a: "No. It stops when the same failure happens twice and caps automatic pushes, then reports what it found." },
          ],
        },
      ],
    },
  ],
  related: ["alerts", "tests", "reviewer"],
};

const alerts: Page = {
  slug: "alerts",
  path: "/alerts/",
  navLabel: "Alerts",
  title: "CloudWatch alarm to pull request",
  description:
    "Route CloudWatch alarms and EventBridge events to CoderHelm through SNS. Matching alerts become analyzed pull requests in the right repository, and recoveries are paired with the alert that raised them.",
  h1: "Alerts to pull requests",
  lede:
    "Subscribe CoderHelm to the SNS topic that carries your alerts and add rules. An alert a rule takes becomes a run in that rule's repository: CoderHelm analyzes it, makes the change and opens a pull request your team reviews.",
  heroFrame: { id: "alert", caption: "An alarm routed to a repository, the pull request CoderHelm opened for it, and the recovery paired with the original alert." },
  sections: [
    {
      id: "how",
      heading: "How alert routing works",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Send alerts to SNS", text: "CloudWatch alarm notifications, AWS Chatbot messages, EventBridge events or plain messages, on a topic in an AWS account your team connected." },
            { title: "Add rules", text: "Each rule names the alarms or alert text it takes, the repository to fix them in and how to act." },
            { title: "Review the fix", text: "The pull request goes through normal review. A pull request CoderHelm wrote never merges without a person's approval." },
          ],
        },
      ],
    },
    {
      id: "pairing",
      heading: "Alerts and recoveries, paired",
      blocks: [
        {
          type: "p",
          text: "When an alarm returns to OK, CoderHelm matches the recovery to the alert that raised it and posts a linked resolved card in Microsoft Teams, so the channel shows what is still open. Alerts no rule takes are posted to Teams only.",
        },
      ],
    },
    {
      id: "limits",
      heading: "Noise control",
      blocks: [
        {
          type: "list",
          items: [
            "Every message must carry a valid SNS signature, from a topic in an AWS account your team connected",
            "Alert text is treated as data, never as instructions",
            "Repeats of the same alert are collapsed into one",
            "An alarm that keeps firing or flaps can post once until it really clears, or once a day, per route or per alarm",
            "Each rule has a daily run cap, and alert runs stop for the day at your team's alert token budget",
          ],
        },
      ],
    },
    {
      id: "logs",
      heading: "Log findings, every six hours",
      blocks: [
        {
          type: "p",
          text: "Connect AWS with a CloudFormation stack that creates a read only role, and CoderHelm scans the CloudWatch log groups you choose every six hours. Each finding has a severity, a summary and a suggested action, and becomes a plan with one click.",
        },
        {
          type: "p",
          text: "A finding that goes quiet resolves on its own after a quiet period that follows how often it happened, and the page says when. When checks of an AWS account fail, the page says so. A self hosted install reads the logs in its own AWS account with its own roles, so there is no stack to launch.",
        },
      ],
    },
  ],
  related: ["maintenance", "data-sources", "security"],
};

const securityFixes: Page = {
  slug: "security-fixes",
  path: "/security-fixes/",
  navLabel: "Security fixes",
  title: "Security fixes for what your code reaches",
  description:
    "CoderHelm checks each advisory that touches your dependencies against your code, opens one fix pull request per repository with CI green, gives each finding a deadline and posts the urgent ones to your alerts channel.",
  h1: "Security fixes",
  lede:
    "An alert for every package that is present, and a pull request for every alert, is noise. CoderHelm reads your code to see whether it calls the vulnerable part, shows you the lines, and spends its pull requests and your attention where they matter.",
  heroFrame: { id: "secfix", caption: "A finding marked reachable, with the lines that call the vulnerable code, its deadline and the fix pull request." },
  sections: [
    {
      id: "how",
      heading: "From an advisory to a merged fix",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Match", text: "Each repository's dependency list is kept up to date, so a new advisory is a lookup. The same flaw listed under its CVE, GHSA and ecosystem IDs counts once." },
            { title: "Check", text: "Development only packages drop to the lowest tier at once. For the rest, CoderHelm searches the code for the package and the functions the advisory names, reads what it finds, and writes a verdict with the files and lines." },
            { title: "Fix", text: "One pull request per repository, not per package: new fixes join the open one. Lockfiles are regenerated by your own package manager. When a major version is needed, it can fix the breaking changes in the same pull request. When Dependabot or Renovate already opened one, it adopts it instead of opening a duplicate." },
            { title: "Tell", text: "Urgent findings post a card to the same channel as your production alerts, updated when the pull request opens, passes CI and merges, and again as the deadline nears." },
          ],
        },
      ],
    },
    {
      id: "verdicts",
      heading: "Four verdicts, each with its evidence",
      blocks: [
        {
          type: "table",
          head: ["Verdict", "Meaning"],
          rows: [
            ["Reachable", "Your code calls the vulnerable part of the package."],
            ["Present, not reachable", "The package is loaded, but nothing calls the vulnerable part."],
            ["Not loaded", "Development or test only."],
            ["Unknown", "The evidence is missing. Treated as reachable when the service faces the internet."],
          ],
        },
        { type: "p", text: "A verdict never closes an alert on its own. Not reachable lowers the tier; only a person dismisses a finding, with a reason that is kept, and that also dismisses the Dependabot alert when the GitHub App may change alerts." },
      ],
    },
    {
      id: "tiers",
      heading: "Tiers and deadlines your team sets",
      blocks: [
        {
          type: "table",
          head: ["Tier", "When", "What happens", "Due"],
          rows: [
            ["P0", "On CISA's exploited list, critical and reachable, or a malicious package", "Pull request at once, card posted", "3 days, or the exploited list's date"],
            ["P1", "High and reachable, or likely to be exploited soon", "Pull request within the hour, card posted", "7 days"],
            ["P2", "Medium and reachable, or high but not reachable", "Pull requests once a day, grouped", "30 days"],
            ["P3", "Development only, not loaded, or low", "One grouped pull request a week", "90 days"],
          ],
        },
        { type: "p", text: "Every part is a setting: when each tier gets a pull request, which tiers post, the days, the labels, and an ignore list where every entry needs a reason and an end date. Turned on, it opens fix pull requests (the recommended choice) within daily limits on fix runs, tokens and cards, so it never runs away with your budget. Or preview first, which opens nothing, and open fix pull requests by hand. The Security page shows each advisory source, when it was last read and what it found." },
      ],
    },
    {
      id: "sources",
      heading: "Where the advisories come from",
      blocks: [
        {
          type: "list",
          items: [
            "OSV.dev, asked about each package and version you use",
            "Dependabot alerts, as they happen, when they are on",
            "GitHub's advisories, for repositories where Dependabot alerts are off",
            "CISA's list of exploited vulnerabilities and FIRST's EPSS scores, for how urgent each one is",
            "Java's own advisories, for the Java version you run, read from Dockerfile images, version files, build settings, CI setup and Lambda declarations, so a bug in the JDK itself becomes a finding: a pull request to the fixed version when one is out, otherwise a rebuild or the advisory's mitigation",
          ],
        },
        { type: "p", text: "A [self hosted](/self-host/) install stores every dependency list in its own AWS account and sends OSV only package names and versions. See the [docs](https://docs.coderhelm.com/getting-started/security-fixes/) for what is sent where." },
      ],
    },
    {
      id: "infrastructure",
      heading: "What you run on AWS, and who has to fix it",
      blocks: [
        { type: "p", text: "Switch on Infrastructure vulnerabilities for a connected AWS account, and CoderHelm reads, read-only and once a day, which AMIs, node groups, databases and caches run there. It matches them by version against AWS's security bulletins and the Amazon Linux and Bottlerocket advisories, with no model and no tokens. It never reads Lambda function settings or user data." },
        {
          type: "table",
          head: ["Fix", "What you get"],
          rows: [
            ["Pull request", "In the Terraform that defines the resource: the AMI, a node group's release version, a Lambda runtime or a Dockerfile base image."],
            ["Apply in AWS", "A pending RDS or Aurora update with no code equivalent. An admin approves it, in the next maintenance window or now, and CoderHelm applies it, the copy outside production first."],
            ["Step in AWS", "The exact CLI command, the console path and AWS's apply-by date, for the other RDS, ElastiCache and OpenSearch updates. CoderHelm never runs it."],
            ["AWS-managed", "Fargate, Lambda, the EKS control plane: AWS patches them, the bulletin says so, and they never count as open."],
          ],
        },
        { type: "p", text: "One row per fix, however many advisories it clears, and it closes only when the next read of the account shows the fix running. See [infrastructure vulnerabilities](/infrastructure-vulnerabilities/), and the [docs](https://docs.coderhelm.com/getting-started/infrastructure-vulnerabilities/) for the permissions and a worked example." },
      ],
    },
  ],
  related: ["infrastructure-vulnerabilities", "alerts", "maintenance"],
};

const infraVulns: Page = {
  slug: "infrastructure-vulnerabilities",
  path: "/infrastructure-vulnerabilities/",
  navLabel: "AWS vulnerabilities",
  title: "Vulnerabilities in what you run on AWS, and who has to fix them",
  description:
    "CoderHelm checks the AMIs, kernels, container base images, EKS nodes, databases and caches in your AWS accounts against AWS's security bulletins, opens the fix pull request or shows the exact AWS step, and marks what AWS patches for you.",
  h1: "AWS vulnerabilities",
  lede:
    "A security bulletin lists every service it touches. CoderHelm reads what actually runs in your AWS accounts, says for each resource whether you have to act, and hands you the fix: a pull request in the code that defines it, or the exact step to run in AWS.",
  heroFrame: { id: "infra", caption: "One AWS bulletin across a team's account: a fix pull request for the instances, one for the node group, a runbook for the database, and what AWS patches on its own." },
  sections: [
    {
      id: "how",
      heading: "From a bulletin to a fix that is running",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Read the bulletins", text: "Once a day, AWS's security bulletins, the Amazon Linux and Bottlerocket advisories, Lambda runtime end dates and AWS's latest images. Nothing about your accounts is sent to read them." },
            { title: "Read your account", text: "Once a day, through the same read only role CoderHelm already uses: describe and list calls only. It matches by version, with no model, so it costs no tokens." },
            { title: "Follow live AWS", text: "A finding closes as fixed only when a read of the account shows the fix running, such as the new AMI on every instance, and as removed when the resource is gone. A merged pull request that never rolled out stays open. Opening the page reads AWS again when the last read is more than five minutes old." },
          ],
        },
      ],
    },
    {
      id: "what",
      heading: "What it checks",
      blocks: [
        {
          type: "table",
          head: ["Resource", "What it reads"],
          rows: [
            ["EC2 instances and Auto Scaling groups", "The AMI and its release, the installed kernel for instances managed by Systems Manager, and whether the internet can reach them"],
            ["Container images", "The base image in a Dockerfile `FROM`, and ECR's own scan results for the images your services run"],
            ["EKS node groups", "Each node group's release version and AMI type, and whether the cluster uses Auto Mode"],
            ["Databases and caches", "RDS and Aurora engine versions and the OS updates AWS has waiting, ElastiCache service updates and OpenSearch software updates"],
            ["Lambda functions", "Runtimes, read from your Terraform: a deprecated runtime gets no more patches"],
          ],
        },
        { type: "p", text: "It never reads Lambda function settings, which hold environment variables, or user data. It changes nothing in your account, except a database update an admin approved, and only when the role allows it." },
      ],
    },
    {
      id: "fixes",
      heading: "Four kinds of fix, one row each",
      blocks: [
        {
          type: "table",
          head: ["Fix", "When", "What you get"],
          rows: [
            ["Fix PR", "The change is in the code that defines the resource", "A pull request that points the AMI at AWS's latest image, sets a node group's release version, changes a Lambda runtime or bumps a Dockerfile base image, with the rollout step when one is needed"],
            ["Apply in AWS", "A pending RDS or Aurora update with no code equivalent", "An admin approves it, in the next maintenance window or now, and CoderHelm applies it through AWS's own pending maintenance action, the copy outside production first. It needs the `ApplyMaintenance` option on the role"],
            ["Runbook", "The change happens in AWS", "The exact AWS CLI command, the path in the AWS console and AWS's apply by date. CoderHelm never runs it"],
            ["AWS-managed", "AWS patches it itself", "The bulletin's reason, collapsed at the bottom. Never counted as open"],
          ],
        },
        { type: "p", text: "One row is one fix: one AMI, one node group, one database, however many advisories it clears. Urgency uses the same tiers as [security fixes](/security-fixes/), with whether the internet can reach the resource in place of whether your code reaches the vulnerable part." },
        { type: "shot", shot: "infra", caption: "Security, Infrastructure: what needs action now, then one row per fix with its tier, the kind of fix and the resource. Example data." },
      ],
    },
    {
      id: "where",
      heading: "Where it shows",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Off until you switch it on", text: "An admin switches it on for each connected AWS account, in Settings, Integrations, AWS. When the role lacks the reads, one link adds exactly those permissions." },
            { title: "Security, Infrastructure", text: "Every open finding with its tier, fix and evidence, filtered by tier or by fix, Check accounts now for admins, and each source with when it was last read." },
            { title: "Insights, Infrastructure", text: "Running in AWS, beside the review of your infrastructure code: every resource with its versions, where it is defined and its open findings. Fixed findings and time to fix show in Analytics." },
          ],
        },
      ],
    },
    {
      id: "infra-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Does it change anything in my AWS account?", a: "Only a database update an admin approved, and only when the role has the `ApplyMaintenance` option on. Everything else it reads with describe and list calls only: fixes in code arrive as pull requests a person reviews, and other steps in AWS are shown for a person to run." },
            { q: "Does it cost tokens?", a: "No. Matching is by version, with no model. Only the fix pull requests it opens use tokens, within the same daily limits as dependency fixes." },
            { q: "Can it use Amazon Inspector or AWS Health?", a: "Both are optional, switched on in the Security policy. When Inspector is on and CoderHelm may read its findings, they take the place of its own matching for what Inspector covers. AWS Health names your affected resources for some bulletins. See the [docs](https://docs.coderhelm.com/getting-started/infrastructure-vulnerabilities/) for the permissions and a worked example." },
          ],
        },
      ],
    },
  ],
  related: ["security-fixes", "alerts", "self-host"],
};

const tests: Page = {
  slug: "tests",
  path: "/tests/",
  navLabel: "Flaky tests",
  title: "Flaky test detection and quarantine",
  description:
    "CoderHelm reads the end to end results your CI produces, tells flaky tests from broken ones, keeps flaky tests from failing builds and opens fix pull requests that must pass twenty runs in a row.",
  h1: "Flaky tests",
  lede:
    "CoderHelm reads every end to end run your CI already produces, tells a flaky test from a broken one, and acts on it.",
  heroFrame: { id: "tests", caption: "The Tests page: each test's history run by run, flaky and broken tests told apart, and the quarantine list." },
  sections: [
    {
      id: "detect",
      heading: "Flaky, broken or a bad run",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Told apart", text: "A test that passed and failed on the same commit is flaky. One that fails almost every time is broken. A run where many tests fail together is a bad run, not many flaky tests." },
            { title: "\"Is this failure mine?\"", text: "Each failing test on a pull request gets one line in the review: known flaky with its history, a bad run, or likely caused by the files this pull request changed." },
            { title: "Quarantine, never for broken tests", text: "When your team turns it on, flaky tests keep running and being recorded but stop failing the build. A broken test is never quarantined. Owners get a ticket after two days by default; each team picks between 1 and 30." },
            { title: "Quarantined failures don't block", text: "When the only failing tests in a run are quarantined ones, CoderHelm treats the run as passing: it does not start a CI fix, armed auto merge goes ahead, and a note on the pull request names the tests." },
            { title: "Fix pull requests with proof", text: "CoderHelm reproduces the flake, fixes it, and marks the pull request ready only after twenty green runs in a row." },
            { title: "Tests you are missing", text: "Uncovered changes and bug fixes without tests become suggested tests, each proposed only after it passes ten repeat runs." },
            { title: "Every run on one page", text: "Runs, each test's history, failures grouped by cause, the slowest tests and the quarantine list." },
            { title: "Fits your CI", text: "Quarantined tests still run in your CI. The Tests page shows the workflow step that keeps them from failing the build itself." },
          ],
        },
      ],
    },
    {
      id: "formats",
      heading: "Reports it reads",
      blocks: [
        {
          type: "p",
          text: "Playwright (JSON or HTML), JUnit XML and Cucumber JSON. Results that never reach GitHub, such as a device farm, can be uploaded with a GitHub Actions token, so there is no secret to store.",
        },
      ],
    },
  ],
  related: ["maintenance", "reviewer", "pull-requests"],
};

const dataSources: Page = {
  slug: "data-sources",
  path: "/data-sources/",
  navLabel: "Data sources",
  title: "Read only data sources for CoderHelm agents",
  description:
    "CoderHelm checks your GraphQL API, CloudWatch Logs, PostgreSQL and Redshift while it plans, writes and reviews, with every lookup read only, enforced in code and recorded.",
  h1: "Data sources",
  lede:
    "Connect your API, logs and databases. While CoderHelm plans, writes code and reviews, it checks what the running system really has: whether a field exists, what a setting is, what the service logged.",
  heroFrame: { id: "lookup", caption: "A bug ticket investigated with a database lookup and a log search, both read only and recorded, before any code is planned." },
  sections: [
    {
      id: "sources",
      heading: "What it can look up",
      blocks: [
        {
          type: "list",
          items: [
            "Your GraphQL API, your CloudWatch Logs, your PostgreSQL databases and your Redshift warehouse",
            "Bug tickets come with evidence: the record, the error and the code that raised it",
            "Reviews confirm a field or table really exists before flagging it",
            "Setup takes minutes: paste one script into AWS CloudShell",
            "Your own tools: named lookups your engineers write once, run only after a second admin approves each exact version",
          ],
        },
      ],
    },
    {
      id: "locks",
      heading: "Read only, enforced in code at every step",
      blocks: [
        { type: "p", text: "Not a promise in a prompt. Each lock below stops a write on its own." },
        {
          type: "cards",
          items: [
            { title: "One read at a time", text: "Each lookup is checked before it is sent: one SELECT, one GraphQL query or one log search. Anything that could change data is refused." },
            { title: "Rolled back, every time", text: "Database lookups run in a read only transaction that is always rolled back." },
            { title: "A user that can only read", text: "CoderHelm signs in as a database user that cannot change any table, checked when you connect and again before use." },
            { title: "A role tied to your team", text: "Access goes through a role in your AWS account that only works with your team's external ID. Delete the role and access ends." },
            { title: "Hidden stays hidden", text: "Fields you hide are refused wherever they appear. Secrets, email addresses and card numbers are scrubbed from results, and only the log groups you choose can be searched." },
            { title: "Every lookup on the record", text: "Each lookup is logged with who asked, what they asked and for which pull request. Follow it live, and switch any source off." },
          ],
        },
      ],
    },
  ],
  related: ["security", "alerts", "skills"],
};

const skills: Page = {
  slug: "skills",
  path: "/skills/",
  navLabel: "Skills",
  title: "Team skills, agent briefs and MCP servers",
  description:
    "CoderHelm works your way: it reads your AGENTS.md, the skills and agent briefs your team keeps in a repository, the MCP servers you connect and what it learned on past runs.",
  h1: "Skills, rules and MCP servers",
  lede:
    "Keep your team's skills and agent briefs in a repository and CoderHelm reads the ones that fit the work. Connect the MCP servers you use and it pulls context from them while it plans and builds.",
  heroFrame: { id: "skills", caption: "A connected skills repository: each skill and agent brief, its switch, and how often the agents read it." },
  sections: [
    {
      id: "skills-repo",
      heading: "Skills kept in a repository",
      blocks: [
        {
          type: "list",
          items: [
            "Skills from `skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`, with the text files next to them",
            "Agent briefs from `agents/<name>.md` and command steps from `commands/<name>.md`",
            "Read from the default branch only, so only merged, reviewed text is used, and synced after every merge",
            "Text only: nothing from a skills repository is ever run, and every guard stays in place",
            "Each item has a switch, and you can see how often each agent read it",
          ],
        },
      ],
    },
    {
      id: "rules",
      heading: "Your rules",
      blocks: [
        {
          type: "p",
          text: "CoderHelm reads AGENTS.md, CLAUDE.md, copilot instructions and .cursorrules from each repository. Admins add guardrails, custom instructions and a team voice for pull request descriptions.",
        },
      ],
    },
    {
      id: "mcp",
      heading: "MCP servers",
      blocks: [
        {
          type: "p",
          text: "Connect any of 17 MCP servers and CoderHelm can use them while it plans and implements: Figma, Sentry, Linear, Notion, Vercel, Stripe, PostHog, GitLab, Neon, Turso, Snyk, LaunchDarkly, MongoDB Atlas, Grafana, Redis, Upstash and Sanity. Credentials are stored encrypted with AWS KMS.",
        },
        {
          type: "p",
          text: "Figma signs in with one click through CoderHelm's Figma app, on the hosted service and on hybrid installs, or with your team's own Figma app or a key. Agents read your Figma files (components, design tokens and layout) while they plan and build, so the UI they build can match the design. Access is read only: nothing in Figma is changed.",
        },
      ],
    },
    {
      id: "memory",
      heading: "Memory you can see",
      blocks: [
        {
          type: "p",
          text: "CoderHelm remembers what it learns on each repository, kept per team and per repository. Each agent has a profile showing what it knows and where it learned it, and you can pin, edit, forget or teach it something new.",
        },
      ],
    },
  ],
  related: ["pull-requests", "data-sources", "reviewer"],
};

const security: Page = {
  slug: "security",
  path: "/security/",
  navLabel: "Trust",
  title: "Security and data handling",
  description:
    "How CoderHelm handles your code and data: changes on its own branch, builds in a sandbox with no credentials, read only data access, KMS encrypted secrets, signed webhooks and team roles.",
  h1: "Security and data handling",
  lede:
    "Every guard on this page is enforced by the platform itself, so it holds whatever the model writes.",
  heroNote:
    "This page is about how CoderHelm protects your code and data. Looking for how CoderHelm fixes vulnerable dependencies in your code? See [Security fixes](/security-fixes/).",
  sections: [
    {
      id: "code",
      heading: "Your code",
      blocks: [
        {
          type: "list",
          items: [
            "CoderHelm reads your repository through the GitHub App, only on the repositories you install it on",
            "It does not git clone your repository; source is fetched when a run needs it",
            "Your build, lint and tests run in a separate container that holds no credentials; the copy of the source it uses is deleted after the build (one day at most)",
            "The code graph keeps symbol names and references, not your source files",
            "The app map keeps names, paths and short descriptions, never your source files",
            "Every change goes on a `coderhelm/` branch and arrives as a pull request; a pull request CoderHelm wrote never merges without a person's approval",
          ],
        },
      ],
    },
    {
      id: "access",
      heading: "Access and secrets",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Encrypted with AWS KMS", text: "Stored tokens, keys and connection details are encrypted with AWS KMS. Data source secrets carry your team in the encryption context, so they cannot be read for another team." },
            { title: "Signed webhooks", text: "GitHub webhooks are checked with HMAC and SNS messages by signature before anything runs." },
            { title: "Team scoped", text: "Every request is scoped to your team, and roles (owner, admin, billing, member, viewer) decide who can change what." },
            { title: "Sign in your way", text: "Email and password, Google, GitHub or Microsoft. A team can add its own Okta: an admin sets it up in Settings, and on CoderHelm's cloud each email domain is proved with a DNS record first. Okta signs in only the person who linked that Okta account, never anyone matched by email." },
            { title: "Two-factor sign-in", text: "Each person has one second factor, asked for after a password, Google, GitHub, Microsoft or Okta alike. A team's admins can require it: people without one see only a setup screen until they set it up." },
            { title: "Read only data sources", text: "Database, API and log lookups are read only, enforced at several independent points.", href: "/data-sources/" },
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "What is stored",
      blocks: [
        {
          type: "p",
          text: "Model calls go to Anthropic through your team's own API key. The [privacy policy](/privacy/) lists every sub processor, what it receives and how long each kind of data is kept.",
        },
        { type: "p", text: "Report a vulnerability to security@coderhelm.com." },
      ],
    },
  ],
  related: ["security-fixes", "data-sources", "self-host"],
};

const knowledge: Page = {
  slug: "knowledge",
  path: "/knowledge/",
  navLabel: "Knowledge",
  title: "Knowledge bases your agents and Chat can search and cite",
  description:
    "Keep pages from Notion, Confluence, Google Drive, Sanity, GitHub, websites and files in sync, import the knowledge base you already have, or connect Amazon Bedrock or any MCP search tool in place. Ask a base on its own page and see which searches used it.",
  h1: "Knowledge",
  lede:
    "A knowledge base holds your specs, runbooks and policies. CoderHelm keeps it in sync with the apps your team writes in, Chat answers from it with a citation on every claim, and the coder follows your runbook instead of guessing.",
  heroFrame: { id: "knowledge", caption: "A knowledge base fed by Notion, Confluence and an S3 import: its status, tiles, a cited answer from this base only, and how each source stands." },
  sections: [
    {
      id: "how",
      heading: "How it works",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Bring it in", text: "Pick the app, sign in and tick what to bring in. Ticking a page, space or folder includes everything inside it, and what is added there later. Pages start arriving at once." },
            { title: "It stays current", text: "Only what changed is fetched and indexed again, down to the passage. Pages that are deleted, moved out or no longer shared are removed. CoderHelm only ever reads from your apps." },
            { title: "Agents and Chat use it", text: "Attach a base to the whole team or to some agents: the planner, coder, reviewer and plan chat get a tool to search it. Chat reads it for anyone who may, and cites each page with a link to where it lives." },
          ],
        },
      ],
    },
    {
      id: "sources",
      heading: "Where your knowledge comes from",
      blocks: [
        {
          type: "table",
          head: ["Source", "What it brings in", "Changes arrive"],
          rows: [
            ["Notion", "Pages and databases", "Within moments with Notion webhooks, otherwise every hour"],
            ["Confluence", "Spaces or page trees", "Every hour"],
            ["Google Drive", "Folders or files: Docs, Sheets, Slides, PDF, Word, Excel and more", "Every hour"],
            ["Sanity", "Published documents. Sign in with Sanity, or use an API token", "Every 15 minutes signed in, the moment they publish with a token"],
            ["GitHub", "Markdown and text files on the default branch", "On every push"],
            ["Websites", "Public pages or a sitemap", "Every hour"],
            ["Files", "PDF, Word, Markdown, text, CSV, Excel and HTML uploads", "When you upload them"],
          ],
        },
      ],
    },
    {
      id: "bring",
      heading: "Bring the knowledge base you already have",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Import from Amazon S3", text: "Pick an account, a bucket and folders. When the read only role can't read it yet, one link updates the role for just that bucket. Each sync reads only what changed." },
            { title: "Import a Bedrock knowledge base", text: "Paste its ARN and tick its S3 data sources. CoderHelm reads the documents behind it and indexes them itself. Nothing in Bedrock changes." },
            { title: "Import an export", text: "Upload a `.zip` of a Notion export, a Confluence HTML export or a docs folder. Upload a newer export later and only what changed is read again." },
            { title: "Connect Bedrock in place", text: "Paste a Bedrock knowledge base's ARN and it is searched live in your AWS account, through your own role. No documents, passages or vectors are copied." },
            { title: "Connect any MCP search tool", text: "Pick a search tool your team runs through its MCP server. One test search runs before anything is saved, and each person can search with their own sign in." },
            { title: "Use your knowledge in Bedrock", text: "Let Bedrock agents search your CoderHelm knowledge live through an AgentCore Gateway, or copy it into a Bedrock knowledge base. A self hosted install sets up a new one with one stack." },
          ],
        },
      ],
    },
    {
      id: "base",
      heading: "Health and answer quality",
      blocks: [
        {
          type: "p",
          text: "Each base has one status, Up to date, Syncing or Needs attention, then four tiles: pages searchable, passages, freshness and searches this week. A problems banner shows only when something is wrong, with each fix, and pages already brought in stay searchable.",
        },
        {
          type: "list",
          items: [
            "Connections: how each source connects (the team's sign in, a person's own, a saved token, the GitHub App, your AWS role, public pages or an export), whose it is, whether its token still works, and what happens if that person leaves",
            "Content: every page as a tree by source and folder, filtered by state, by when it was updated and by source, each linking to the original",
            "Left out, never hidden: pages that couldn't be read or were skipped (no text, a file type that isn't read, too large) say why, and can be picked and read again",
            "Sync history: every sync for 90 days, what started it, how long it took and what it added, updated, removed or skipped",
          ],
        },
      ],
    },
    {
      id: "ask",
      heading: "Asking a knowledge base",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "A cited answer from this base only", text: "Ask a question and get an answer from this base's pages, through Chat. The thread is saved in your Chat history, and Continue in Chat picks it up." },
            { title: "Passages only, at no AI cost", text: "See what a search finds instead of an answer: the ranked passages, a score against the best match, whether the last answer cited each, and a link to the original." },
            { title: "Suggested questions", text: "Questions written from the base's own page titles, one click each, so you can check it answers well before your team relies on it." },
          ],
        },
        { type: "shot", shot: "kbBase", caption: "A knowledge base page: one status, four tiles, a problems banner and Ask this knowledge base with Passages only on. Example data." },
      ],
    },
    {
      id: "usage",
      heading: "Searches that used it",
      blocks: [
        {
          type: "p",
          text: "Usage counts the searches this week from Chat, agent runs, MCP and API keys and the page itself, lists the most cited pages and the runs and chats that used it, and shows the questions it had no good answer for, so you know which page to add. Pages no search found in 90 days are candidates to leave out.",
        },
        { type: "shot", shot: "kbUsage", caption: "Usage: searches by where they came from, the most cited pages, where it was used and the questions it couldn't answer. Example data." },
      ],
    },
    {
      id: "limits",
      heading: "Cost and limits",
      blocks: [
        {
          type: "list",
          items: [
            "A source keeps up to 50,000 items by default, and admins choose anything from 1,000 to 100,000 under Sync limits, with what a full first sync costs",
            "One knowledge base holds up to 100,000 synced items across its sources; connected in place, a search tool or Bedrock base has no size limit here",
            "A first sync of more than 2,000 items shows its estimate and waits for an admin to press Start sync",
            "Indexing counts against your team's monthly token limit, and big syncs carry on by themselves until they are done",
            "Nothing is cut silently: a source that covers more than it keeps says so with the real numbers, and admins can raise the limit",
          ],
        },
      ],
    },
    {
      id: "kb-faq",
      heading: "FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "Who can read what is in a knowledge base?", a: "Each base has a read role (everyone, members or admins), and can be narrowed to some people or roles. Everyone who can read the base can read every page in it, even pages they can't open in the app, and the dialog says so when you add a source." },
            { q: "Does CoderHelm change anything in Notion, Confluence or Drive?", a: "No. It only reads: nothing is changed, created or deleted in the app." },
            { q: "How does the coder use it?", a: "Agents attached to a base get a tool to search it while they plan, write and review, for whoever started the run, so a plan can follow your runbook instead of guessing. A base limited to some people is only searched in runs one of them started." },
            { q: "Can we keep our knowledge in our own AWS account?", a: "Yes. Connect a Bedrock knowledge base in place and nothing is copied, or [self-host](/self-host/) all of CoderHelm. See the [docs](https://docs.coderhelm.com/concepts/knowledge-sources/) for every source." },
          ],
        },
      ],
    },
  ],
  related: ["chat", "skills", "data-sources"],
};

const chat: Page = {
  slug: "chat",
  path: "/chat/",
  navLabel: "Chat",
  title: "Chat that reads your code and cites it",
  description:
    "Ask CoderHelm about your team's repositories and knowledge. Chat opens the code itself, searches it, follows the code graph and cites every claim with the real file path and lines.",
  h1: "Chat",
  lede:
    "Chat answers questions about your team's work from your own sources: your repositories, your knowledge, connected apps, memories, data sources and skills. It does the reading itself and shows exactly where each answer came from.",
  sections: [
    {
      id: "research",
      heading: "How it reads your code",
      blocks: [
        {
          type: "p",
          text: "Chat looks a repository over (its README, its folders, manifests such as `package.json` and agent notes such as `AGENTS.md`), searches the code, reads files by line range and checks the code graph, over as many steps as the question needs. Every read is pinned to one commit. It never asks you to open or paste a file it can read; an answer that does is sent back before you see it.",
        },
        { type: "shot", shot: "chat", caption: "One quiet line says what Chat read; open it to see each step. The answer cites files by number. Example data." },
      ],
    },
    {
      id: "asking",
      heading: "Asking",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "It picks what to read", text: "Every question can use everything you can see. Name a repository in the question and Chat reads that one." },
            { title: "Tickets and what needs you", text: "Chat looks up your Jira tickets, pull requests and runs. Ask what needs your answer, in any words, and it lists run questions, pull requests on your tickets, your Jira mentions and GitHub reviews and failing checks, by urgency, each with a link and what to do." },
            { title: "@ to narrow", text: "Type @ to point a question at one repository or knowledge collection. Nothing is narrowed unless you choose it." },
            { title: "Numbered citations", text: "Hover or tap a number to see the source: the file path and lines with a link to them on GitHub at that commit, or the knowledge page and its date." },
            { title: "No guessing", text: "When nothing in your sources supports an answer, Chat says so instead of making one up." },
            { title: "Private until shared", text: "Your chats are yours. Share one and teammates can read it; only you ask in it." },
            { title: "Metered and capped", text: "Chat's model calls show under their own name on the usage page and count toward your token limits." },
          ],
        },
      ],
    },
    {
      id: "knowledge",
      heading: "Knowledge that stays in sync",
      blocks: [
        {
          type: "p",
          text: "A knowledge base holds pages from the apps your team writes in, next to files you upload. Pick what to bring in once and CoderHelm keeps it current, removes what is deleted and cites each page with a link back to where it lives. Agents can search a base too, so a plan can follow your runbook instead of guessing.",
        },
        {
          type: "table",
          head: ["Source", "What it brings in"],
          rows: [
            ["Notion", "Pages and databases"],
            ["Confluence", "Spaces or page trees"],
            ["Google Drive", "Folders or files: Docs, Sheets, Slides, PDF, Word, Excel and more"],
            ["Sanity", "Published documents. Sign in with Sanity, or use an API token for instant updates"],
            ["GitHub", "Markdown and text files on the default branch"],
            ["Websites", "Public pages or a sitemap"],
            ["Files", "PDF, Word, Markdown, text, CSV, Excel and HTML uploads"],
          ],
        },
        { type: "shot", shot: "knowledge", caption: "A knowledge base fed by several apps, each card showing whether it is up to date. Example data." },
        { type: "p", text: "CoderHelm only ever reads from these apps: nothing is changed, created or deleted there. Import the knowledge base you already have, connect Bedrock or any MCP search tool in place, and see what each base answers on [its own page](/knowledge/)." },
      ],
    },
  ],
  related: ["knowledge", "pull-requests", "skills"],
};

const selfHost: Page = {
  slug: "self-host",
  path: "/self-host/",
  navLabel: "Self-host",
  title: "Self-host CoderHelm in your own AWS account",
  description:
    "Run all of CoderHelm in your own AWS account, installed from your browser: AWS quick create, your GitHub App in one click, a model access check, your own domain and checks for every step.",
  h1: "Self-host",
  lede:
    "Your code, tickets, logs and model calls never pass through CoderHelm's account. The install guide sets it up from your browser, and the install keeps checking itself after that.",
  heroCta: { label: "Open the install guide", href: SITE.installUrl },
  sections: [
    {
      id: "guide",
      heading: "Installed from your browser",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "AWS", text: "Enter your email and pick a region. One click opens AWS on a quick create page with every value filled in. CoderHelm deploys inside your account as one CloudFormation stack in about 20 minutes, with live progress in the guide." },
            { title: "GitHub and models", text: "Create your own GitHub App in one click; its keys go straight to your install. Your install then checks that Claude answers on Amazon Bedrock and opens the right page if access is missing." },
            { title: "Domain and the rest", text: "Keep the AWS address or add your own domain: in Route 53 it is set up for you, anywhere else you copy two DNS records and the guide checks them live. Then pick from the optional setup list." },
          ],
        },
        {
          type: "actions",
          items: [
            { label: "Open the install guide", href: SITE.installUrl },
            { label: "Read the self-hosting docs", href: "https://docs.coderhelm.com/self-host/" },
          ],
        },
        {
          type: "p",
          text: "The guide talks to AWS, GitHub and your own install, and counts anonymous page views with Google Analytics. Nothing you type and nothing about your install is sent to CoderHelm or Google.",
        },
        {
          type: "p",
          text: "Releases are published on [GitHub](https://github.com/CoderHelm/coderhelm-platform/releases).",
        },
      ],
    },
    {
      id: "moving",
      heading: "Moving from CoderHelm cloud?",
      blocks: [
        {
          type: "p",
          text: "We'll help you plan the move and bring your settings and data over to your own AWS account. Tell us about your team and a person from CoderHelm will work through it with you.",
        },
        {
          type: "actions",
          items: [{ label: "Talk to us about moving", href: SITE.moveUrl }],
        },
      ],
    },
    {
      id: "after",
      heading: "Health checks",
      blocks: [
        {
          type: "p",
          text: "The same install checks run in three places: the install guide, the `doctor` command on your machine and the Setup page in the dashboard. Each failing check says what is wrong, why it matters and how to fix it.",
        },
        { type: "shot", shot: "setup", caption: "The Setup page of a self hosted install. Example data." },
      ],
    },
    {
      id: "running",
      heading: "Running it",
      blocks: [
        {
          type: "cards",
          items: [
            { title: "Updates from the app", text: "One press of Update in Settings installs the newest release, or let it install in your maintenance window. Choose Stable, or Beta for nightly builds. An update that would replace data asks you to confirm first. Admins get an email only when they need to act or something went wrong, plus an optional weekly what's new." },
            { title: "Never waiting on an AWS admin", text: "Updates install without an AWS admin. When a release can do more with extra permissions, that is a separate, optional item with one link for an AWS admin, and the update never waits for it." },
            { title: "Hybrid or fully private", text: "One choice for the whole install: CoderHelm's apps (easiest, the default), with events through CoderHelm's relay, or fully private. With CoderHelm's apps, Jira, Notion, Confluence, Google Drive, Figma and every app CoderHelm adds later work with no setup. A tool with its own app set up always uses it, and GitHub sign in has its own choice." },            { title: "Your models", text: "Amazon Bedrock in your account, with no API key anywhere, or each team's own Anthropic API key." },
            { title: "Serverless on AWS", text: "Lambda, API Gateway, SQS, DynamoDB, S3, CloudFront, Cognito and SES. No servers to patch, and no Rust or Docker needed to install." },
            { title: "Prefer a terminal?", text: "The installer asks a few questions, deploys the release and creates your GitHub App: `npx -y github:CoderHelm/coderhelm-platform init`, then `deploy`." },
          ],
        },
      ],
    },
    {
      id: "license",
      heading: "License",
      blocks: [
        {
          type: "list",
          items: [
            "CoderHelm is licensed under FSL-1.1-ALv2, the Functional Source License with Apache 2.0 as the future license",
            "You can run it, change it and self-host it for your own company",
            "You can't offer it, or something built from it, as a competing hosted product",
            "Each release becomes Apache 2.0 two years after it ships",
          ],
        },
        { type: "p", text: "The full terms are in the [license](https://github.com/CoderHelm/coderhelm/blob/main/LICENSE.md)." },
      ],
    },
  ],
  related: ["security", "chat", "pull-requests"],
};

function legal(slug: string, navLabel: string, title: string, description: string, body: string): Page {
  return { slug, path: `/${slug}/`, navLabel, title, description, h1: title, lede: "", sections: [], kind: "legal", body };
}

export const pages: Page[] = [
  home,
  setup,
  pullRequests,
  reviewer,
  stalePrs,
  maintenance,
  alerts,
  securityFixes,
  infraVulns,
  tests,
  dataSources,
  skills,
  knowledge,
  chat,
  selfHost,
  security,
  legal("contact", "Contact", "Contact", "How to reach CoderHelm for support, legal, privacy, security and abuse reports.", contact),
  legal("privacy", "Privacy", "Privacy Policy", "How CoderHelm collects, uses and protects your data, and the sub processors it uses.", privacy),
  legal("terms", "Terms", "Terms of Service", "The terms that govern your use of CoderHelm.", terms),
  legal("acceptable-use", "Acceptable use", "Acceptable Use Policy", "What you may and may not do with CoderHelm.", acceptableUse),
];

export function pageBySlug(slug: string): Page | undefined {
  return pages.find((p) => p.slug === slug);
}

export function mdPath(page: Page): string {
  return page.slug === "" ? "/index.md" : `/${page.slug}.md`;
}

// The header: a Features menu with every feature page in groups, then a few
// pages that stand on their own.
export const featureGroups: { title: string; slugs: string[] }[] = [
  { title: "Write and review", slugs: ["setup", "pull-requests", "reviewer", "stale-pull-requests", "maintenance"] },
  { title: "In production", slugs: ["alerts", "security-fixes", "infrastructure-vulnerabilities", "tests"] },
  { title: "Context", slugs: ["chat", "knowledge", "data-sources", "skills"] },
];

export function featureMenu(): { title: string; pages: Page[] }[] {
  return featureGroups.map((g) => ({ title: g.title, pages: g.slugs.map((s) => pageBySlug(s)!) }));
}

export function navPages(): Page[] {
  return ["reviewer", "security-fixes", "chat", "self-host", "security"].map((s) => pageBySlug(s)!);
}
