# CoderHelm

> Ship code, not tickets.

Autonomous AI coding agent that turns GitHub issues and Jira tickets into draft pull requests. Assign a ticket — CoderHelm creates a branch, implements the change, runs your CI, self-reviews, and opens a PR.

🌐 [coderhelm.com](https://coderhelm.com)

## Features

- **GitHub & Jira integration** — trigger runs from issue assignment, labels, or comments
- **Multi-pass pipeline** — triage → plan → implement → CI check → self-review
- **Image-aware** — reads screenshots and mockups attached to Jira tickets
- **MCP plugin system** — extend the agent with custom tools (Notion, Slack, databases, etc.)
- **Memory** — learns from your codebase, past runs, and team preferences
- **Infrastructure analysis** — detects CDK, Terraform, and Serverless frameworks in your repos
- **Team dashboard** — view runs, plans, settings, usage analytics, and agent logs in real time

## What's in this repo

```
dashboard/   → Next.js 15 dashboard SPA (TypeScript, Tailwind, shadcn/ui)
brand/       → Logo, favicon, brand assets
```

### Dashboard pages

| Page | Description |
|---|---|
| `/runs` | Active and completed runs with status, cost, and duration |
| `/runs/detail` | Live agent log, progress tracker, pass history, PR links |
| `/plans` | Plan chat — describe what to build, get an ordered list of GitHub issues |
| `/memory` | Browse and manage learned memories per repo |
| `/infrastructure` | Infrastructure analysis results (CDK/Terraform/Serverless) |
| `/settings` | Team, repos, plugins, security, billing |
| `/analytics` | Token usage, cost breakdown, run history charts |

## Development

```bash
cd dashboard && npm install && npm run dev
```

Runs at `http://localhost:3000`. Requires the platform API to be running (or use the production API).

## Deployment

Pushing to `main` triggers CI — the dashboard is built and deployed to S3 + CloudFront automatically.
