<!--
Release notes for the top of /changelog/, newest first. scripts/import-platform.mjs
puts them above the generated list of merged pull requests. Write what changed for
the team in plain words, one "## <date>: <what>" heading per release, and link the
pull requests that shipped it. Leave out CI, pins and dependency bumps.
-->

## November 15, 2026: Atlassian as one connection, infrastructure that follows AWS, and the team's bases

- **Atlassian is one connection.** Jira, Confluence and Atlassian's own agent tools are one row under **Settings**, **Integrations**, with a status for each part. Sign-in follows what Atlassian's server publishes, and when Atlassian's sign-in page is failing, CoderHelm says so instead of sending you to an error page. Existing connections keep working with nothing to reconnect. See [Connect Atlassian](/getting-started/atlassian). ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713), [#427](https://github.com/CoderHelm/coderhelm/pull/427))
- **The Jira app is Jira only.** It no longer asks for Confluence access, so this is the last update that needs a site admin for a long time. Accept it in **Atlassian Administration**: **Apps**, **Sites**, your site, **Connected apps**, **Coderhelm**, **View app details**, **Update**. ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713))
- **Infrastructure findings follow live AWS.** Resources that are gone close as removed, fixes that are running close as fixed, and duplicates merge. Every pending RDS and Aurora action shows. Opening the page reads AWS again when the last read is more than five minutes old. ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713))
- **Approved updates in AWS.** A database update that has no code equivalent can be applied by CoderHelm after an admin approves it, in the next maintenance window or now, with the copy outside production first. It needs the new `ApplyMaintenance` parameter on the account's role. See [Infrastructure vulnerabilities](/getting-started/infrastructure-vulnerabilities#updates-coderhelm-applies-in-aws). ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713))
- **Log findings trace their repo.** The fix goes to the repo the error's own image, build files and code point at, without asking. Each sighting is judged against its own week: usual noise is counted quietly, something new is said once, and something new and critical or rising gets acted on. A burst of the same error costs one analysis. ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713))
- **Six built-in team bases.** Code, Work, Infrastructure, Logs, Security and Knowledge are ready with nothing to set up, each with its own readers. People in your GitHub organization can connect an AI tool as a reader without an account or a seat. See [Claude, Cursor and VS Code](/mcp#the-teams-bases). ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713), [#427](https://github.com/CoderHelm/coderhelm/pull/427))
- **Lower model spend on reviews.** Reviews are written on the lighter model measured against the strongest one, and the strongest model still checks every review. The part of the review prompt shared by every pull request in a repository is cached. A team can keep every review on the strongest model. See [The PR reviewer](/getting-started/reviewer#which-model-writes-reviews). ([#713](https://github.com/CoderHelm/coderhelm-platform/pull/713))

## November 15, 2026: pull request descriptions get a final review

- **A final review of every description.** Before CoderHelm posts or updates a pull request description, a last pass removes repeated lines, filler and raw ids, and keeps checks that are still running apart from results. ([#703](https://github.com/CoderHelm/coderhelm-platform/pull/703))
- **Your pull request template is followed.** When a repository has a template, its headings are the description's layout, in its order. ([#703](https://github.com/CoderHelm/coderhelm-platform/pull/703))
- **Runs always deliver the pull request.** A run that needs work outside the code still makes the change and opens the pull request. Only things a person must do are listed once, under **Needed from you**. ([#703](https://github.com/CoderHelm/coderhelm-platform/pull/703))
- **CoderHelm runs staging deploys itself** when the repository has a deploy workflow it can start or a label that starts one. ([#703](https://github.com/CoderHelm/coderhelm-platform/pull/703))
- **Every event stays inside its team.** An audit of every path an event takes (webhooks, live updates, queues, notifications, knowledge, caches) closed four places where data could reach the wrong team. ([#704](https://github.com/CoderHelm/coderhelm-platform/pull/704))

## November 15, 2026: AI tools read what the team knows, and the Connect page

- **AI tools read what Chat reads.** Claude, Cursor, VS Code and other MCP apps can now look up tickets, pull requests, runs, findings, AWS resources and code, as the person who connected them. See [Claude, Cursor and VS Code](/mcp). ([#699](https://github.com/CoderHelm/coderhelm-platform/pull/699))
- **The Connect page.** **AI tools**, beside Knowledge, gives your MCP address with a copy button, setup for each tool, example questions, the scopes and the tools you connected. ([#423](https://github.com/CoderHelm/coderhelm/pull/423))
- **Outside work is done by the run.** Reading workflow runs, page checks, a lint or the production release steps are CoderHelm's to do. A step reaches a person only when it truly needs one, such as a missing permission or credential. ([#700](https://github.com/CoderHelm/coderhelm-platform/pull/700))
- **Tool health.** A tool that fails is diagnosed once, retried where that helps, and set aside for ten minutes while the run takes another way. The failure is reported once on the run page. ([#700](https://github.com/CoderHelm/coderhelm-platform/pull/700))

## November 15, 2026: Chat lookups and replies that read the thread

- **Chat's lookups work again.** Runs, ticket and pull request lookups read correctly, and Chat says in its answer when a source it needed couldn't be read. ([#698](https://github.com/CoderHelm/coderhelm-platform/pull/698))
- **A calmer Chat page.** Lookups show short and live while Chat works, fold away when the answer starts, and a lookup Chat recovered from is a quiet row, not a red error. The page keeps your place while an answer streams. ([#422](https://github.com/CoderHelm/coderhelm/pull/422), [#415](https://github.com/CoderHelm/coderhelm/pull/415))
- **Threaded Jira replies.** When CoderHelm answers your Jira comment, the reply goes under it where your site allows, and always mentions you and quotes your comment. ([#693](https://github.com/CoderHelm/coderhelm-platform/pull/693))
- **Replies written from the conversation.** Every reply to a person on GitHub or Jira reads the thread, the ticket and the run's records, and says what it understood, what it did or the one thing it needs. ([#694](https://github.com/CoderHelm/coderhelm-platform/pull/694))
- **An older Jira app is shown.** When your site still runs an older Coderhelm Jira app, the dashboard says what it is missing and how to update. ([#696](https://github.com/CoderHelm/coderhelm-platform/pull/696), [#421](https://github.com/CoderHelm/coderhelm/pull/421))

## November 14, 2026: runs that finish their own work, auto rollback and the Activity tab

- **Comments that read the thread, and a gate for what reaches a person.** Nothing CoderHelm can do itself is handed to a person. ([#687](https://github.com/CoderHelm/coderhelm-platform/pull/687))
- **Runs finish their own review's fixes**, and descriptions and titles share one layout. ([#691](https://github.com/CoderHelm/coderhelm-platform/pull/691))
- **Auto rollback for self-hosted installs.** For 10 minutes after every update, CoderHelm watches the new release and rolls a failing one back by itself. See [Updates](/self-host/updates). ([#681](https://github.com/CoderHelm/coderhelm-platform/pull/681))
- **The Activity tab** on a run page tells the run's story in time order and is never blank. ([#680](https://github.com/CoderHelm/coderhelm-platform/pull/680), [#417](https://github.com/CoderHelm/coderhelm/pull/417))
- **Skills run on CoderHelm.** Steps written for a person's laptop, such as scripts and saving files, run in CoderHelm's sandbox, and a run lists the files it kept. ([#677](https://github.com/CoderHelm/coderhelm-platform/pull/677), [#416](https://github.com/CoderHelm/coderhelm/pull/416))
- **One status per product** on **Integrations**, worked out from every way your team reaches it. ([#672](https://github.com/CoderHelm/coderhelm-platform/pull/672), [#414](https://github.com/CoderHelm/coderhelm/pull/414))
- **Quarantined tests have a next step.** Each one shows its state, CoderHelm works the oldest first, and **Fix this test** or **Remove this test** is one click. ([#669](https://github.com/CoderHelm/coderhelm-platform/pull/669), [#413](https://github.com/CoderHelm/coderhelm/pull/413))
- **Dependency updates are proven.** Package families move together, the advisory count matches the package manager's audit, and a major version change says why it is safe. ([#671](https://github.com/CoderHelm/coderhelm-platform/pull/671))
- **GitHub's hourly limit is a wait, never a failure**, and runs get the budget before background sweeps. ([#673](https://github.com/CoderHelm/coderhelm-platform/pull/673))
- **A closed infrastructure fix pull request** says who closed it, and the fix is offered again. ([#666](https://github.com/CoderHelm/coderhelm-platform/pull/666), [#412](https://github.com/CoderHelm/coderhelm/pull/412))
- **Token use explained.** **Analytics** shows what a period's tokens were, which work and model used them, and a tokens per merged pull request that counts only merged work. ([#662](https://github.com/CoderHelm/coderhelm-platform/pull/662), [#411](https://github.com/CoderHelm/coderhelm/pull/411))

## November 13, 2026: runs that act like a senior engineer

- **Runs stay with the pull request** through review, merge and deploy, and learn from how their pull requests end. The **Learning** page shows a scorecard, the lessons with their evidence and what reviewers keep asking for. ([#654](https://github.com/CoderHelm/coderhelm-platform/pull/654), [#406](https://github.com/CoderHelm/coderhelm/pull/406))
- **Descriptions are built from the code on the head** and rebuilt whenever the head changes. ([#658](https://github.com/CoderHelm/coderhelm-platform/pull/658), [#665](https://github.com/CoderHelm/coderhelm-platform/pull/665), [#674](https://github.com/CoderHelm/coderhelm-platform/pull/674))
- **A comment on a ticket while a run works** is kept, acknowledged and acted on. ([#664](https://github.com/CoderHelm/coderhelm-platform/pull/664))
- **Log findings know when their error stopped**, and say so with the evidence instead of looking like a live emergency. ([#656](https://github.com/CoderHelm/coderhelm-platform/pull/656), [#408](https://github.com/CoderHelm/coderhelm/pull/408))
- **Infrastructure updates** are a pull request when the resource is in code, and a full runbook when it isn't. ([#658](https://github.com/CoderHelm/coderhelm-platform/pull/658), [#407](https://github.com/CoderHelm/coderhelm/pull/407))
- **Dependency runs stay inside the major version** where a patched release exists, and prove the build and the start. ([#648](https://github.com/CoderHelm/coderhelm-platform/pull/648))

## November 12, 2026: runs that finish, private networks and log incidents

- **Runs finish.** A run ends delivered, or hands back only for a listed reason. Fix rounds go on while they make progress instead of stopping at a fixed count, and red checks take out only what breaks them. ([#635](https://github.com/CoderHelm/coderhelm-platform/pull/635), [#643](https://github.com/CoderHelm/coderhelm-platform/pull/643), [#647](https://github.com/CoderHelm/coderhelm-platform/pull/647))
- **Pull request bodies always fit GitHub's limit.** ([#636](https://github.com/CoderHelm/coderhelm-platform/pull/636))
- **Every agent reads the repository's memories**: the reviewer, the planner, the coding agent, the feedback agent and the stop judge. ([#637](https://github.com/CoderHelm/coderhelm-platform/pull/637), [#401](https://github.com/CoderHelm/coderhelm/pull/401))
- **Private networks for data sources.** A self-hosted install can read a search cluster that is reachable only inside a VPC. See [Private networks](/self-host/private-networks). ([#639](https://github.com/CoderHelm/coderhelm-platform/pull/639), [#403](https://github.com/CoderHelm/coderhelm/pull/403))
- **Log incidents.** Findings with one cause are one incident, one card and one fix, seen within minutes. Fix pull requests post to the alerts channel by default. ([#640](https://github.com/CoderHelm/coderhelm-platform/pull/640), [#620](https://github.com/CoderHelm/coderhelm-platform/pull/620), [#402](https://github.com/CoderHelm/coderhelm/pull/402))
- **The reviewer blocks a possible break** of the change's main path until it is checked. ([#633](https://github.com/CoderHelm/coderhelm-platform/pull/633))
- **Security triage reads the code**, so whether a vulnerable part is reached settles, and tiers move. ([#621](https://github.com/CoderHelm/coderhelm-platform/pull/621))
- **The AWS card** updates the access stack in place and switches optional reads from the card. ([#628](https://github.com/CoderHelm/coderhelm-platform/pull/628), [#623](https://github.com/CoderHelm/coderhelm-platform/pull/623))
- **Setup explains itself** per repo: why each feature is on, off or a preview. ([#618](https://github.com/CoderHelm/coderhelm-platform/pull/618), [#389](https://github.com/CoderHelm/coderhelm/pull/389))

## November 11, 2026: security selection, stale pull request modes and knowledge sync limits

- **Fix everything a filter matches** on **Security**, in one request. ([#613](https://github.com/CoderHelm/coderhelm-platform/pull/613), [#384](https://github.com/CoderHelm/coderhelm/pull/384))
- **Stale pull requests** close after 7 quiet days plus 7 more by default, with one Off, Preview only or On mode. ([#614](https://github.com/CoderHelm/coderhelm-platform/pull/614), [#385](https://github.com/CoderHelm/coderhelm/pull/385))
- **Security fix runs read release notes** and write lockfiles with the repository's own package manager. ([#615](https://github.com/CoderHelm/coderhelm-platform/pull/615))
- **Knowledge sources** keep up to 50,000 items by default, with sync history and a page that reads what each base is used for. ([#601](https://github.com/CoderHelm/coderhelm-platform/pull/601), [#607](https://github.com/CoderHelm/coderhelm-platform/pull/607))
