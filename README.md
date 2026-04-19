# CoderHelm

> Ship code, not tickets.

Autonomous AI coding agent that turns GitHub issues and Jira tickets into draft pull requests. Assign a ticket — CoderHelm creates a branch, implements the change, runs your CI, self-reviews, and opens a PR.

🌐 [coderhelm.com](https://coderhelm.com)

## What's in this repo

```
dashboard/   → Next.js dashboard SPA (runs, plans, settings, memory)
landing/     → Marketing landing page
brand/       → Logo, favicon, brand assets
```

## Development

```bash
# Install dependencies
cd dashboard && npm install

# Run dev server
npm run dev
```

## Deployment

Pushing to `main` triggers CI — the dashboard is built and deployed to S3 + CloudFront automatically.
