# CoderHelm Setup Guide

## Prerequisites

- **Rust** 1.80+ (`rustup update stable`)
- **Node.js** 22+ (for CDK and dashboard)
- **AWS CDK** v2 (`npm install -g aws-cdk`)
- **AWS CLI** configured with your AWS account credentials

## AWS Secrets Manager

Create a secret named `Coderhelm/<stage>/secrets` containing your GitHub App credentials, OAuth secrets, and a JWT signing key. See the CDK stack definitions for the required fields.

## Environment Variables

| Variable               | Where  | Description                                                          |
|------------------------|--------|----------------------------------------------------------------------|
| `CDK_DEFAULT_ACCOUNT`  | CDK    | Your AWS account ID                                                  |
| `MODEL_ID`             | Worker | Bedrock model ID (e.g. `us.anthropic.claude-sonnet-4-20250514-v1:0`) |
| `STAGE`                | Both   | `dev` or `prod`                                                      |

## Deploy

```bash
# Build & deploy everything (from repo root)
CDK_DEFAULT_ACCOUNT="<your-account>" MODEL_ID="<your-model-id>" cdk deploy --all
```

Or use the GitHub Actions workflow — push to `main`.

## GitHub App Registration

1. Go to https://github.com/settings/apps/new
2. Set your homepage and webhook URLs
3. Permissions: Contents (RW), Issues (RW), Pull requests (RW), Checks (R), Metadata (R)
4. Events: Issues, Issue comment, Pull request review, Check run, Installation
5. Generate a private key and store in Secrets Manager
