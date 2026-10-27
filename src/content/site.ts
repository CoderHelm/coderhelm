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
  tagline: "Ship code, not tickets. The AI engineer that stays on the code after the pull request.",
  // The one sentence that defines the product, used word for word in the home
  // page, the meta description, JSON-LD and llms.txt.
  entity:
    "CoderHelm is an AI coding agent for GitHub and Jira. Assign it an issue or a ticket and it opens a pull request in your repository, then it stays on the code: it answers review comments, fixes its own failing CI, reviews your team's pull requests and turns production alerts into fixes that a person approves. Teams can also ask it about their code and documents in Chat, and run it hosted or in their own AWS account.",
  llmsDetails: [
    "Status: the hosted service is in closed beta. Sign in at https://app.coderhelm.com; new accounts are admitted from a waitlist.",
    "Self-hosting: runs in your own AWS account, installed from the browser at https://docs.coderhelm.com/self-host/install/ or from a terminal. The first public self-host release is not out yet; releases are published at https://github.com/CoderHelm/coderhelm-platform/releases. License: FSL-1.1-ALv2 (each release becomes Apache 2.0 two years after it ships).",
    "Models: Claude. Hosted teams use their own Anthropic API key; self-hosted installs use Amazon Bedrock in their own account or each team's Anthropic API key. Admins can set monthly token limits: one for new tokens, one for cache reads and one for cache writes.",
    "Chat: answers questions about the team's repositories and knowledge. It reads the code itself (overview, files, code search, code graph) and cites real file paths and lines.",
    "Knowledge sources: Notion, Confluence, Google Drive, Sanity, GitHub, websites and uploaded files, kept in sync.",
    "API: a public REST API with team API keys, described at https://docs.coderhelm.com/openapi.json. Outbound webhooks tell your systems what CoderHelm did, signed the Standard Webhooks way and retried for about a day.",
    "Logs: reads the CloudWatch log groups you choose through a read only role every six hours, lists what it finds, and can open a fix pull request for new findings on its own.",
    "Works with: GitHub (GitHub App), Jira (Forge app), Microsoft Teams, AWS (CloudWatch alarms through SNS, CloudWatch Logs, PostgreSQL, Redshift), GraphQL APIs, Playwright, JUnit and Cucumber reports, and 17 MCP servers.",
    "Starts a run when: a GitHub issue is assigned to CoderHelm, gets the `coderhelm` label, or gets a `/coderhelm` or `@coderhelm` comment; a Jira ticket is assigned to CoderHelm or gets the `coderhelm` label.",
    "Reviews any pull request that gets the review label (`ch-review` by default) once a repository turns the reviewer on.",
    "Not: a code editor or IDE plugin. It works through issues, tickets and pull requests.",
  ],
  featureList: [
    "GitHub issue to pull request",
    "Jira ticket to pull request",
    "AI code review on any GitHub pull request",
    "Fixes failing CI on its own pull requests",
    "Answers review comments and pushes fixes",
    "CloudWatch alarm to pull request through SNS",
    "Flaky test detection and quarantine",
    "Read only lookups in GraphQL APIs, CloudWatch Logs, PostgreSQL and Redshift",
    "Team skills and agent briefs read from a repository",
    "AI plans that turn a description into ordered issues",
    "Chat that reads your repositories and cites file paths and lines",
    "Knowledge from Notion, Confluence, Google Drive, Sanity, GitHub, websites and files",
    "Agent permissions: allow, ask or deny, with approvals",
    "Custom roles and monthly token limits",
    "Public REST API with team API keys",
    "Signed outbound webhooks, retried for about a day",
    "CloudWatch Logs analysis that opens fix pull requests",
    "Self-hosting in your own AWS account",
  ],
  sameAs: ["https://github.com/CoderHelm"],
  ctaNote: "CoderHelm is in closed beta. Sign in to request access; you bring your own Anthropic API key.",
  updated: "2026-10-26",
  updatedLabel: "October 26, 2026",
  year: 2026,
} as const;

const home: Page = {
  slug: "",
  path: "/",
  navLabel: "Home",
  title: "CoderHelm: AI coding agent for GitHub and Jira. Ship code, not tickets.",
  description:
    "Assign a GitHub issue or Jira ticket and get a pull request. Then CoderHelm keeps the code healthy: it fixes its CI, answers review comments, reviews PRs, turns alerts into fixes and answers questions about your code.",
  eyebrow: "Closed beta",
  h1: "Ship code, not tickets.",
  lede:
    "Assign a GitHub issue or Jira ticket and get a pull request. CoderHelm reads your codebase, plans the change, writes it and reviews its own work, then keeps the code healthy after it ships.",
  sections: [
    {
      id: "how-it-works",
      eyebrow: "How it works",
      heading: "One ticket, followed all the way to production.",
      blocks: [
        {
          type: "story",
          chapters: [
            {
              title: "Turn tickets into pull requests",
              steps: [
                {
                  id: "assign",
                  title: "Assign the ticket",
                  heading: "Assign an issue or a ticket, or add a label.",
                  text: "On GitHub, assign the issue to CoderHelm, add the `coderhelm` label or comment `/coderhelm`. On Jira, assign the ticket or add the label. It reads the ticket, your AGENTS.md and the code, then writes a plan with the files it will touch.",
                  frame: "ticket",
                  caption: "A Jira ticket assigned to CoderHelm, and the plan it wrote before touching any code.",
                  href: "/pull-requests/",
                  linkLabel: "Tickets to pull requests",
                },
                {
                  id: "open",
                  title: "Open the pull request",
                  heading: "It builds, tests and reviews its own work first.",
                  text: "It writes the change on a `coderhelm/` branch, runs your build, lint and tests in a sandbox that holds no credentials, reviews its own work for up to three rounds, runs a security check and opens the pull request.",
                  frame: "run",
                  caption: "A run in the CoderHelm dashboard: each stage from triage to the opened pull request, with the files it changed.",
                  href: "/pull-requests/",
                  linkLabel: "What happens during a run",
                },
              ],
            },
            {
              title: "Keep pull requests healthy after they open",
              steps: [
                {
                  id: "ci",
                  title: "Fix failing CI",
                  heading: "A check fails. It reads the logs and fixes the cause.",
                  text: "It pushes again until the checks pass, stops when the same failure repeats and caps automatic pushes at eight. When an end to end test fails for a reason the change did not cause, it runs it once more and says so.",
                  frame: "cifix",
                  caption: "A failing check on a CoderHelm pull request: the log line it read, the fix it pushed and the checks going green.",
                  href: "/maintenance/",
                  linkLabel: "How it fixes CI",
                },
                {
                  id: "comments",
                  title: "Answer review comments",
                  heading: "Ask for a change on its pull request and it makes it.",
                  text: "It replies in the thread, pushes the fix and says what changed. It also resolves conflicts with the base branch, so the pull request does not go stale while it waits.",
                  frame: "reply",
                  caption: "A review comment on a CoderHelm pull request, its reply and the commit that made the change.",
                  href: "/maintenance/",
                  linkLabel: "Maintenance before and after the merge",
                },
                {
                  id: "review",
                  title: "Review every pull request",
                  heading: "Add a label to any pull request and it reviews it.",
                  text: "Not only its own. It reads the callers and tests around the change, comments on exact lines with suggestions you can apply, rates the risk and says why, and reviews again on every push. It learns from which comments your team acts on or dismisses, and shows what it changed and why.",
                  frame: "review",
                  caption: "A CoderHelm review: a risk level with the reason, a comment on the exact line with a suggested fix, and earlier comments it resolved after they were fixed.",
                  href: "/reviewer/",
                  linkLabel: "Everything the reviewer does",
                },
                {
                  id: "merge",
                  title: "Merge and check the deploy",
                  heading: "Nothing it wrote merges without a person's approval.",
                  text: "Auto merge is off by default. Turned on, it waits for a person's approval and green checks on the exact reviewed commit, then watches the deploy checks and reports only failures that are new since the merge.",
                  frame: "merge",
                  caption: "An approved pull request merged on the reviewed commit, followed by the deploy check CoderHelm ran after it.",
                  href: "/maintenance/",
                  linkLabel: "After the merge",
                },
              ],
            },
            {
              title: "Catch problems in production",
              steps: [
                {
                  id: "alerts",
                  title: "Turn alerts into fixes",
                  heading: "A production alarm becomes a fix in the right repository.",
                  text: "Route CloudWatch alarms to CoderHelm through SNS and a rule picks the repository. It analyzes the alert, opens a pull request for a person to approve, and pairs the recovery with the original alert. It also reads the log groups you choose every six hours through a read only role, and can open a fix for each new finding on its own.",
                  frame: "alert",
                  caption: "A CloudWatch alarm routed to the right repository, the pull request CoderHelm opened, and the recovery paired with the alert.",
                  href: "/alerts/",
                  linkLabel: "Alerts to pull requests",
                },
                {
                  id: "tests",
                  title: "Keep tests from blocking",
                  heading: "Flaky tests stop failing builds. Broken ones are never hidden.",
                  text: "It reads your Playwright, JUnit and Cucumber reports and tells flaky tests from broken ones. With quarantine on, flaky tests stop failing builds, and its fix pull requests must pass twenty runs in a row.",
                  frame: "tests",
                  caption: "Tests sorted into flaky, broken, quarantined and passing from their last ten runs, and a fix pull request with twenty green runs.",
                  href: "/tests/",
                  linkLabel: "Flaky test detection",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "chat",
      eyebrow: "Chat",
      heading: "Ask about your code. Get answers you can check.",
      blocks: [
        {
          type: "p",
          text: "Chat reads your team's repositories itself: it looks a repository over, searches the code, reads the files and follows the code graph. Every claim has a numbered citation with the real file path and lines, and it never asks you to paste what it can open.",
        },
        {
          type: "list",
          items: [
            "It reads everything you can see; type @ to narrow a question to one repository or knowledge collection",
            "Knowledge from Notion, Confluence, Google Drive, Sanity, GitHub, websites and files, kept in sync",
            "When nothing in your sources supports an answer, it says so",
          ],
        },
        { type: "actions", items: [{ label: "How Chat works", href: "/chat/" }] },
        { type: "shot", shot: "chat", caption: "Chat answering a question about a repository: what it read, then an answer with numbered citations. Example data." },
      ],
    },
    {
      id: "around-the-work",
      eyebrow: "Around the work",
      heading: "What it uses to get the change right.",
      blocks: [
        {
          type: "bento",
          items: [
            {
              title: "Checks your real systems before it guesses",
              text: "Read only lookups in your GraphQL API, CloudWatch Logs, PostgreSQL and Redshift, enforced in code and recorded with who asked and for which pull request.",
              href: "/data-sources/",
              mini: "lookup",
              wide: true,
            },
            {
              title: "Plans you approve",
              text: "Describe the work in the dashboard. CoderHelm streams a plan, and each task you approve becomes an issue and a run, in order.",
              href: "/pull-requests/#plans",
              mini: "plans",
            },
            {
              title: "Works your way",
              text: "Reads your AGENTS.md, the skills your team keeps in a repository and the MCP servers you connect, and keeps a memory you can see and edit.",
              href: "/skills/",
              mini: "skills",
            },
            {
              title: "Guarded in code, not in a prompt",
              text: "Allow, ask or deny for everything an agent does, with approvals. Its own branch, a build sandbox with no credentials, read only data access, secrets encrypted with AWS KMS and custom roles.",
              href: "/security/",
              mini: "security",
              wide: true,
            },
          ],
        },
        {
          type: "p",
          text: "Works with GitHub, Jira, Microsoft Teams, AWS, Playwright, JUnit and Cucumber reports, 17 MCP servers, and Claude models through your own Anthropic API key or Amazon Bedrock. Build on it with the [public API](https://docs.coderhelm.com/api/) and [signed webhooks](https://docs.coderhelm.com/api/webhooks/) that tell your systems what it did.",
        },
      ],
    },
    {
      id: "self-host",
      eyebrow: "Self-host",
      heading: "Run it in your own AWS account.",
      blocks: [
        {
          type: "p",
          text: "Your code, tickets, logs and model calls stay in your account. The install guide sets it up from your browser and checks every step against your own install.",
        },
        {
          type: "list",
          items: [
            "One click opens AWS with every value filled in, and the guide follows the install as it runs",
            "Your GitHub App in one click, and a check that Claude answers on Amazon Bedrock",
            "Your own domain, set up in Route 53 for you or with DNS records to copy, checked live",
            "The same install checks in the guide, the `doctor` command and the dashboard's Setup page",
            "Automatic updates in a maintenance window, health checked and rolled back if unhealthy",
            "Every install and update checks the release's signature before anything runs",
            "Fully private, or hybrid: use CoderHelm's GitHub App and event relay, and see every event in and out on the Deliveries page",
            "One organization per install: nobody signs up on their own, and admins can require two factor sign in",
          ],
        },
        {
          type: "actions",
          items: [
            { label: "Open the install guide", href: SITE.installUrl },
            { label: "More about self-hosting", href: "/self-host/" },
          ],
        },
        {
          type: "p",
          text: "The guide talks to AWS, GitHub and your own install, and counts anonymous page views with Google Analytics. Nothing you type and nothing about your install is sent to CoderHelm or Google.",
        },
        {
          type: "note",
          text: "The first public self-host release is not out yet. Until it is, you can read through the guide, but an install cannot finish.",
        },
        {
          type: "p",
          text: `Moving from CoderHelm cloud? [Talk to us](${SITE.moveUrl}) and we'll help move your settings and data.`,
        },
        { type: "shot", shot: "setup", caption: "The Setup page of a self hosted install: each check passing, or saying what is wrong and how to fix it. Example data." },
      ],
    },
    {
      id: "faq",
      eyebrow: "FAQ",
      heading: "Questions teams ask first.",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "What is CoderHelm?", a: SITE.entity },
            { q: "How do I start a run?", a: "On GitHub, assign the issue to CoderHelm, add the `coderhelm` label, or comment `/coderhelm` or `@coderhelm`. On Jira, assign the ticket to CoderHelm or add the `coderhelm` label (your admin can change the label)." },
            { q: "Does CoderHelm push to my main branch?", a: "No. It writes every change on its own `coderhelm/` branch and opens a pull request. Merging is your call; the optional auto merge for reviewed pull requests waits for a person's approval and green checks." },
            { q: "What happens after the pull request is merged?", a: "CoderHelm stays on the code. It answers questions and review comments, reviews new pull requests that get the review label, turns routed alerts into fixes, keeps flaky tests from blocking builds and, with auto merge on, checks the deploy after the merge and reports only new failures." },
            { q: "Which languages does it support?", a: "It works on the repository as text and runs your own build and tests, so it is not tied to one language or framework." },
            { q: "Which AI models does it use?", a: "Claude models from Anthropic, through your team's own Anthropic API key. A self-hosted install can use Amazon Bedrock in its own AWS account instead. Admins can choose the models and set monthly token limits." },
            { q: "Can we run it ourselves?", a: "Yes. CoderHelm runs entirely in your own AWS account, installed from your browser with the [install guide](https://docs.coderhelm.com/self-host/install/). It is licensed under FSL-1.1-ALv2: you can run it, change it and self-host it for your own company, and each release becomes Apache 2.0 two years after it ships. See [self-hosting](/self-host/)." },
            { q: "How much does it cost?", a: "CoderHelm is in closed beta. Each team brings its own Anthropic API key, so model usage is billed to your Anthropic account, and admins can cap it with a monthly token limit." },
            { q: "Can it change data in my database?", a: "No. Lookups are read only, enforced in code at several independent points: the query is checked, the transaction is read only and rolled back, and the database user cannot write." },
          ],
        },
      ],
    },
  ],
};

const pullRequests: Page = {
  slug: "pull-requests",
  path: "/pull-requests/",
  navLabel: "Tickets to PRs",
  title: "GitHub issue and Jira ticket to pull request",
  description:
    "Assign a GitHub issue or Jira ticket to CoderHelm and it plans the change, writes it on its own branch, runs your build and tests, reviews its own work and opens a pull request.",
  eyebrow: "Tickets to pull requests",
  h1: "From a GitHub issue or Jira ticket to a pull request.",
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
            { title: "Review and open", text: "It reviews its own work (up to three fix rounds), runs a security check, resolves conflicts with the base branch and opens the pull request." },
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
          text: "In the dashboard, describe what you want to build. CoderHelm streams a plan as it reasons, searching your code and the MCP servers you connected for the details. Approve it and each task becomes a GitHub issue and a run, in order.",
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
  eyebrow: "Code review",
  h1: "AI code review on every GitHub pull request.",
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
            "A new review on every push, and its own comments resolved once they are fixed",
            "Answers in the thread: `@coderhelm` with a question, `@coderhelm re-review`, or the Re-request review button",
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
          ],
        },
      ],
    },
  ],
  related: ["maintenance", "tests", "pull-requests"],
};

const maintenance: Page = {
  slug: "maintenance",
  path: "/maintenance/",
  navLabel: "Maintenance",
  title: "AI that fixes failing CI and answers review comments",
  description:
    "CoderHelm stays on the code after the pull request: it answers review comments, fixes failing CI on its pull requests, resolves merge conflicts, checks deploys after merge and writes release notes.",
  eyebrow: "After the pull request",
  h1: "It doesn't hand off. It stays on the code.",
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
  eyebrow: "Alerts to fixes",
  h1: "From a CloudWatch alarm to a pull request.",
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
      heading: "Built to stay calm",
      blocks: [
        {
          type: "list",
          items: [
            "Every message must carry a valid SNS signature, from a topic in an AWS account your team connected",
            "Alert text is treated as data, never as instructions",
            "Repeats of the same alert are collapsed into one",
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
      ],
    },
  ],
  related: ["maintenance", "data-sources", "security"],
};

const tests: Page = {
  slug: "tests",
  path: "/tests/",
  navLabel: "Flaky tests",
  title: "Flaky test detection and quarantine",
  description:
    "CoderHelm reads the end to end results your CI produces, tells flaky tests from broken ones, keeps flaky tests from failing builds and opens fix pull requests that must pass twenty runs in a row.",
  eyebrow: "Test health",
  h1: "Flaky tests stop blocking you. Broken ones never hide.",
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
  title: "Read only data sources for an AI coding agent",
  description:
    "CoderHelm checks your GraphQL API, CloudWatch Logs, PostgreSQL and Redshift while it plans, writes and reviews, with every lookup read only, enforced in code and recorded.",
  eyebrow: "Checks the facts",
  h1: "It looks before it guesses. Read only.",
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
  eyebrow: "Your way of working",
  h1: "It runs on your skills, your rules and your tools.",
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
  navLabel: "Security",
  title: "Security and data handling",
  description:
    "How CoderHelm handles your code and data: changes on its own branch, builds in a sandbox with no credentials, read only data access, KMS encrypted secrets, signed webhooks and team roles.",
  eyebrow: "Security",
  h1: "Guarded in code, not in a prompt.",
  lede:
    "Every guard on this page is enforced by the platform itself, so it holds whatever the model writes.",
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
            { title: "Two-factor sign-in", text: "Each person has one second factor, asked for after a password, Google or GitHub alike. A team's admins can require it: people without one see only a setup screen until they set it up." },
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
  related: ["data-sources", "alerts", "pull-requests"],
};

const chat: Page = {
  slug: "chat",
  path: "/chat/",
  navLabel: "Chat",
  title: "Chat that reads your code and cites it",
  description:
    "Ask CoderHelm about your team's repositories and knowledge. Chat opens the code itself, searches it, follows the code graph and cites every claim with the real file path and lines.",
  eyebrow: "Chat and knowledge",
  h1: "Ask about your code. Every claim comes with its source.",
  lede:
    "Chat answers questions about your team's work from your own sources: your repositories, your knowledge, connected apps, memories, data sources and skills. It does the reading itself and shows exactly where each answer came from.",
  sections: [
    {
      id: "research",
      heading: "It opens the code, like a teammate would",
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
        { type: "p", text: "CoderHelm only ever reads from these apps: nothing is changed, created or deleted there." },
      ],
    },
  ],
  related: ["pull-requests", "skills", "security"],
};

const selfHost: Page = {
  slug: "self-host",
  path: "/self-host/",
  navLabel: "Self-host",
  title: "Self-host CoderHelm in your own AWS account",
  description:
    "Run all of CoderHelm in your own AWS account, installed from your browser: AWS quick create, your GitHub App in one click, a model access check, your own domain and checks for every step.",
  eyebrow: "Self-hosting",
  h1: "All of CoderHelm, in your own AWS account.",
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
            { title: "AWS", text: "Enter your email and pick a region. One click opens AWS on a quick create page with every value filled in. CoderHelm deploys inside your account in about 20 minutes, with live progress in the guide." },
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
          type: "note",
          text: "The first public self-host release is not out yet. Until it is, you can read through the guide, but an install cannot finish. Releases are published on [GitHub](https://github.com/CoderHelm/coderhelm-platform/releases).",
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
      heading: "It keeps checking itself",
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
            { title: "Automatic updates", text: "Turn them on and new releases install in your maintenance window, health checked and rolled back if unhealthy. Off, admins get an email about each release." },
            { title: "Your models", text: "Amazon Bedrock in your account, with no API key anywhere, or each team's own Anthropic API key." },
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
  pullRequests,
  reviewer,
  maintenance,
  alerts,
  tests,
  dataSources,
  skills,
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

export function navPages(): Page[] {
  return ["pull-requests", "reviewer", "maintenance", "chat", "self-host", "security"].map((s) => pageBySlug(s)!);
}
