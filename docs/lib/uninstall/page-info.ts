// The uninstall page as the rest of the site sees it: its Markdown twin (for
// agents and llms.txt) and its sitemap entry. The page itself is interactive
// (components/uninstall/guide.tsx).
import { SITE } from '@/lib/shared';

export const UNINSTALL_GUIDE = {
  url: '/self-host/uninstall',
  title: 'Uninstall CoderHelm',
  description:
    'Self-hosted CoderHelm is one CloudFormation stack: delete it in the AWS console, choose whether the data stays, then check nothing CoderHelm-named is left.',
};

export function uninstallGuideMarkdown(): string {
  return `# ${UNINSTALL_GUIDE.title}

Source: ${SITE.url}${UNINSTALL_GUIDE.url}

${UNINSTALL_GUIDE.description}

## Steps

1. **Your install.** Its name and region. The stack is \`coderhelm-<name>\`.
2. **Keep the data or not.** The stack parameter \`KeepDataOnDelete\` is \`true\` unless you changed it: deleting the stack keeps the tables, the data bucket, the KMS keys, the user pool and the secret. To delete those too, first run **Update stack**, **Use current template**, set \`KeepDataOnDelete\` to \`false\`, and submit. KMS keys are then deleted after AWS's shortest wait of 7 days.
3. **Delete the stack.** In CloudFormation, select \`coderhelm-<name>\` and choose **Delete**. CloudFormation removes every part in order. With \`KeepDataOnDelete=false\` the stack empties its buckets and deletes its tables itself, retrying while DynamoDB settles. A hybrid install releases its CoderHelm address first.
4. **Check nothing is left.** \`npx -y github:CoderHelm/coderhelm-platform leftovers --stage <name> --region <region>\` lists, read-only, anything still named or tagged for the install: data you kept, pieces from an earlier failed install, the auto-update role if auto-update was ever on. \`--delete\` removes them after you type the install name.

Details: [Uninstall](${SITE.url}/self-host/uninstall-details/).

## Installs from before one-stack releases

Move it first with \`coderhelm-selfhost migrate\`, or remove it by name with \`coderhelm-selfhost uninstall\` (\`--everything\` for the data too).
`;
}
