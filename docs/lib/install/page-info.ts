// The install guide as the rest of the site sees it: its Markdown twin (for
// agents and llms.txt), its sitemap entry and its Open Graph image. The page
// itself is interactive (components/install/wizard.tsx); this text says what
// it does and how to do the same by hand.
import { SITE } from '@/lib/shared';

export const INSTALL_GUIDE = {
  url: '/self-host/install',
  title: 'Install CoderHelm',
  description:
    'Install self-hosted CoderHelm in your own AWS account from the browser: one click opens AWS with everything filled in, then the guide creates your GitHub App, checks model access and confirms every step against your own install.',
};

export function installGuideMarkdown(): string {
  return `# ${INSTALL_GUIDE.title}

Source: ${SITE.url}${INSTALL_GUIDE.url}

${INSTALL_GUIDE.description}

The guide is an interactive page. It talks to AWS, GitHub and your own CoderHelm, and counts anonymous page views with Google Analytics (origin and path only). Nothing you type and nothing about your install is sent to CoderHelm or Google. With a CoderHelm address (Hybrid), it also asks CoderHelm's API whether the name you picked is free.

## Steps

1. **AWS.** Enter your email and pick a region. The guide opens the CloudFormation console on a quick-create page with every value filled in. You tick the boxes that let the stack create IAM roles and expand its nested templates, and press Create stack. CloudFormation creates CoderHelm as one stack, \`coderhelm-<name>\`, after checking every release file against the SHA-256 in the signed template (about 20 minutes). It needs no domain: CoderHelm gets a cloudfront.net address. The guide follows the install through a small progress file in your account.
2. **GitHub.** The guide sends GitHub a manifest for CoderHelm's own GitHub App (contents, pull requests and issues: write; workflows: write; checks, actions and statuses: read). You press Create GitHub App. GitHub sends the app's keys straight to your CoderHelm (\`/api/setup/github/callback\`), using a one-time setup key from the launch. Then you install the app on your repositories.
3. **Models.** Your CoderHelm makes one tiny call to each Claude model on Amazon Bedrock. If Anthropic's one-time use case form hasn't been submitted for the account, the guide opens the Bedrock page for it and checks again.
4. **Ready.** You open CoderHelm and sign up with your email as the first admin.

Each check comes from your install's own \`GET /api/setup/status\` ([the contract](https://github.com/CoderHelm/coderhelm-platform/blob/main/docs/self-host/setup-checks.md)).

## What it does in your AWS account

A permissions boundary caps every role CoderHelm creates: no IAM users or keys, no IAM outside \`coderhelm-<name>-*\`, and no changes to Organizations, account settings, CloudTrail or GuardDuty. The stack runs with your own permissions: there is no installer build, no deploy role (unless you turn auto-update on) and no CDK bootstrap. It copies the release's files into a private bucket of yours, checking each against the SHA-256 in the signed template, before anything uses them. Updates are stack updates you review as a change set; uninstalling is Delete stack, and \`KeepDataOnDelete\` decides about the data. Each CoderHelm service gets a narrow role of its own. A small progress bucket, \`coderhelm-setup-<id>\`, holds one file the guide reads: the install's progress and address, public if the account allows it, deleted with the stack. Nothing gives CoderHelm the company access to the account. The AWS link holds the one-time setup key, so don't share it. Every resource and role, the risks and how to remove it all: [What CoderHelm does in your AWS account](${SITE.url}/self-host/aws-account/).

## Without the guide

- The terminal install: [Quick start](${SITE.url}/self-host/quick-start.md).
- The same CloudFormation template, by release: \`https://coderhelm-public.s3.amazonaws.com/launch/<version>/coderhelm.json\` (the newest stable release is named in \`https://coderhelm-public.s3.amazonaws.com/launch/latest.json\`).
`;
}
