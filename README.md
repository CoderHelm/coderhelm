# Coderhelm

> Your code, Coderhelm handled.

Autonomous AI coding agent — assign a GitHub issue, get a draft PR.

## Architecture

```
dashboard/        → Next.js static SPA (S3 + CloudFront)
services/gateway/ → Rust Lambda (webhook receiver + API)
services/worker/  → Rust Lambda (AI orchestrator)
infra/            → CDK (TypeScript)
brand/            → Logo, favicon, brand guidelines
```

## Prerequisites

- **Rust** 1.80+ with `cargo-lambda` (`cargo install cargo-lambda`)
- **Node.js** 20+ with npm
- **AWS CDK** v2 (`npm install -g aws-cdk`)
- **AWS CLI** configured with credentials

## Setup

```bash
# Install CDK dependencies
cd infra && npm install

# Build gateway
cd services/gateway && cargo lambda build --release

# Build worker
cd services/worker && cargo lambda build --release

# Build dashboard
cd dashboard && npm install && npm run build

# Deploy
cd infra && cdk deploy --all
```

## Manual Steps (one-time)

1. Register a GitHub App at https://github.com/settings/apps/new
2. Buy `Coderhelm.com` domain
3. Create AWS Secrets Manager entries (see infra/README.md)
4. Deploy: `cd infra && cdk deploy --all`
