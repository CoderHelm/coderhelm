# CoderHelm

> Ship code, not tickets.

CoderHelm is an AI coding agent for GitHub and Jira. Assign it an issue or a ticket and it opens a pull request in your repository. Then it stays on the code: it fixes its own failing CI, answers review comments, reviews your team's pull requests and turns production alerts into fixes that a person approves.

[coderhelm.com](https://coderhelm.com) · [Docs](https://docs.coderhelm.com) · [Self-host install guide](https://docs.coderhelm.com/self-host/install/) · [API](https://docs.coderhelm.com/api/)

## What it does

- **Tickets to pull requests.** Assign a GitHub issue or Jira ticket, add the `coderhelm` label or comment `/coderhelm`. It plans the change, writes it on a `coderhelm/` branch, runs your build and tests in a sandbox with no credentials, reviews its own work and opens the pull request.
- **Stays on the code.** Fixes failing CI on its pull requests, answers review comments, resolves conflicts, and with auto merge on, merges only the reviewed commit after a person approves and checks the deploy.
- **Reviewer.** Add the review label to any pull request for line comments with suggestions, a risk level and a new review on every push.
- **Chat.** Ask about your repositories and knowledge. Chat reads the code itself (overview, files, code search, code graph), picks what to read on its own, lets you narrow with @, and cites every claim with the real file path and lines.
- **Knowledge.** Notion, Confluence, Google Drive, Sanity, GitHub, websites and uploaded files, kept in sync.
- **Plans.** Describe a bigger change and get an ordered list of tickets to approve.
- **Tests, releases, logs and alerts.** Flaky test detection and quarantine with a guided setup, release tags and notes, log findings, and alert routes that turn CloudWatch alarms into pull requests.
- **Control.** Agent permissions (allow, ask or deny, with approval cards and sign-in prompts), custom roles, monthly token limits, a weekly summary email and a public API with team API keys.

## Use it

- **Hosted:** sign in at [app.coderhelm.com](https://app.coderhelm.com) (closed beta). Start with the [quickstart](https://docs.coderhelm.com/getting-started/).
- **Self-hosted:** run all of it in your own AWS account. The [install guide](https://docs.coderhelm.com/self-host/install/) does it from your browser and checks each step; the backend and installer live in [coderhelm-platform](https://github.com/CoderHelm/coderhelm-platform). The first public self-host release is not out yet; releases are published [there](https://github.com/CoderHelm/coderhelm-platform/releases).

## What's in this repo

| Folder | What it is |
|---|---|
| `src/` | The marketing site, [coderhelm.com](https://coderhelm.com) (Next.js, static export) |
| `docs/` | The docs site, [docs.coderhelm.com](https://docs.coderhelm.com) (Fumadocs), including the browser install guide |
| `dashboard/` | The dashboard app, [app.coderhelm.com](https://app.coderhelm.com) (Next.js, static export) |
| `infra/` | AWS CDK for the sites |
| `brand/` | Logo, favicon and brand assets |

## Development

```bash
npm install && npm run dev                       # marketing site
cd docs && npm install && npm run dev            # docs site
cd dashboard && npm install && npm run dev       # dashboard
```

The dashboard runs at `http://localhost:3000` and needs the platform API (or its end to end tests' mocks: `npm run test:e2e`).

## Deployment

Pushing to `main` runs CI, then builds and deploys the sites to S3 and CloudFront.

## License

CoderHelm is licensed under the [Functional Source License, Version 1.1, with Apache 2.0 as the future license](LICENSE.md) (FSL-1.1-ALv2). In plain words:

- You can run it, change it and self-host it for your own company.
- You can't offer it, or something built from it, as a competing hosted product.
- Each release becomes Apache 2.0 two years after it ships.

The full terms are in [LICENSE.md](LICENSE.md).
