// The uninstall guide as the rest of the site sees it: its Markdown twin
// (for agents and llms.txt) and its sitemap entry. The page itself is
// interactive (components/uninstall/guide.tsx).
import { SITE } from '@/lib/shared';

export const UNINSTALL_GUIDE = {
  url: '/self-host/uninstall',
  title: 'Uninstall CoderHelm',
  description:
    'Remove self-hosted CoderHelm from your AWS account from the browser: keep its data or delete everything, type the install name to confirm, follow the uninstall live and end with a check that nothing is left.',
};

export function uninstallGuideMarkdown(): string {
  return `# ${UNINSTALL_GUIDE.title}

Source: ${SITE.url}${UNINSTALL_GUIDE.url}

${UNINSTALL_GUIDE.description}

The guide is an interactive page. It talks only to the AWS console and the uninstaller's progress file in your own account. Admins open it from Settings, System, Uninstall, with the install filled in.

## Steps

1. **Choose.** The install name and region, then **Remove CoderHelm, keep my data** or **Delete everything**. The guide lists what goes and what stays. Delete everything also deletes the tables and their backups, the data bucket, the user pool, the secret, and schedules the KMS keys for deletion in 7 days (AWS's shortest wait).
2. **Confirm.** Type the install name. The guide opens the CloudFormation console on a quick-create page for the uninstall stack with everything filled in; the stack refuses to start unless the name is typed again exactly. Tick the IAM box and press Create stack.
3. **Remove.** The uninstaller finds the install's pieces, releases a hybrid install's CoderHelm address and hands GitHub and Jira back to CoderHelm hosted, deletes the stacks, the data when chosen, the Launch Stack, then the logs, buckets, roles and the permissions boundary (10 to 40 minutes).
4. **Check.** The final list: what was removed, what was kept, keys scheduled for deletion and anything left. The uninstall stack then rolls itself back, which removes the uninstaller with your credentials.

## What it may touch

Its build can delete nothing until a window function checks it is that stack's own build and gives it a window bound to the build and an end time. The window reaches only resources named or tagged for the install (\`coderhelm-<name>-*\`, \`coderhelm:install = coderhelm-<name>\`), never another install whose name starts with this one's and never the uninstaller itself. AWS's IAM policy simulator checks it. Details: [Uninstall](${SITE.url}/self-host/uninstall-details/).

## Without the guide

\`npx -y github:CoderHelm/coderhelm-platform uninstall\` (keep the data) or \`uninstall --everything\`, and \`uninstall --verify --stage <name> --region <region>\` to list what is left.
`;
}
