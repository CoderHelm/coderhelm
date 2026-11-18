<!--
Release notes for the top of /changelog/, newest first. scripts/import-platform.mjs
puts them above the generated list of merged pull requests. Write what changed for
the team in plain words, one "## <date>: <what>" heading per release, and link the
pull requests that shipped it. Leave out CI, pins and dependency bumps. The page
groups releases by day: one heading per day, each release a subheading under it.
-->

## November 17, 2026: tests that actually run, and plan dependents released by their own ticket

- **Tests actually run.** Workspace packages install from the workspace root with CI's own job, cached install and pinned versions, and a failed install says why. Test runs that don't fit in a step get a fresh step of their own instead of being skipped, more CI test commands are read, and the run page and pull request say how many tests ran with and without the change. ([#769](https://github.com/CoderHelm/coderhelm-platform/pull/769))
- **A merged plan task releases its own dependents.** The task is found through its ticket's plan link, or by the ticket recorded on its own task row, so a Jira task releases its dependents and an issue number in another repository can never release the wrong ones. ([#719](https://github.com/CoderHelm/coderhelm-platform/pull/719))

## November 17, 2026: criteria proven both ways, a reviewer that converges, reproduce first

- **Each ticket criterion is proven both ways.** The plan maps every acceptance criterion to an end-to-end test of the page it names, and before the pull request is called done each test is run on staging (it must fail) and on the preview (it must pass); a test that passes on both goes back to the coder. Near-identical helpers added in one change are caught. ([#766](https://github.com/CoderHelm/coderhelm-platform/pull/766))
- **A reviewer that converges.** Each finding gets one verdict; everything is raised in the first review; a blocking finding must name its file, line, the existing code and the change wanted; a finding doesn't move to the next file, ask for the opposite of an earlier request, or block after CoderHelm's own fix rounds deferred it; a person's answer is never called out of scope. Once the criteria are proven and CI is green, the review approves with notes, and the posted review follows every new commit. ([#765](https://github.com/CoderHelm/coderhelm-platform/pull/765))
- **Reproduce before planning.** A bug plan quotes the ticket's real names, the command run on the base and its output, and the line where the code goes wrong, and fixes the mechanism that line belongs to. A change much wider than the records the ticket names is flagged, tests must fail on the base before they count, questions are answered by a lookup first, and a person's answer moves work into scope. ([#768](https://github.com/CoderHelm/coderhelm-platform/pull/768))
- **New AWS reads reach every team.** The read-only role is one template with named read groups shipped with each release; when a team's role is older than the release or lacks a read a feature needs, Settings shows one item with a one-click CloudFormation update, and runs carry on instead of asking. ([#764](https://github.com/CoderHelm/coderhelm-platform/pull/764))

## November 17, 2026: checked pushes, scope held, and tidy reviews

- **A fix is pushed only after its own checks pass.** Before every push CoderHelm runs the type check, lint and tests of the package that owns each changed file, the whole unit suite when shared code changes. A red result is not pushed; a check that can't run is marked unverified in the commit. Commit messages are checked against their diff, a revert takes its tests with it, and after two fixes for the same failing test CoderHelm stops and names the test and its error instead of rolling the branch back. ([#760](https://github.com/CoderHelm/coderhelm-platform/pull/760))
- **Scope is decided once and held.** Every plan says what is out of scope and why; the run records it before any code, and code or tests brought back against it are fixed in the next round unless a criterion or a person's answer moves it. Open product questions become decided defaults, and the description is rebuilt from the head on every push: no stale history, no claims the diff contradicts, and a length that fits the change. ([#762](https://github.com/CoderHelm/coderhelm-platform/pull/762))
- **Reviews and threads stay tidy.** After a push, merge or close, CoderHelm's older reviews shrink to one line, its threads whose finding no longer holds (checks now pass, the code is gone) are resolved and hidden, and new reviews show only the verdict and what holds the merge, with the rest folded. A person's review or thread is never touched. ([#761](https://github.com/CoderHelm/coderhelm-platform/pull/761))

## November 17, 2026: red checks reproduced first, and a reviewer that reads only the change

- **A red check is reproduced before it is blamed or reverted.** When an end-to-end test fails, CoderHelm runs it against staging and the preview and records both. It reverts its own work only when that record shows the change caused the failure, and when the test fails on staging too it fixes the test on the branch. The fixer reads the failure's test name, error and screenshot, and the description drops "CI is failing" and revert lines once they stop being true. ([#754](https://github.com/CoderHelm/coderhelm-platform/pull/754))
- **The reviewer reads only the pull request's own change.** After main is merged in, files the merge brought are no longer reviewed or called unrelated. A passing end-to-end run whose report shows a page's test ids counts as a probe, and when one is missing the reviewer probes the page itself instead of blocking. Failing checks are compared test by test with main before anything is called pre-existing, and a review that asks for a test sends it to the coder as work, with how to test scripts and CI. ([#758](https://github.com/CoderHelm/coderhelm-platform/pull/758))

## November 17, 2026: tests built from the live page, and WAF alarms that read their evidence

- **Tests against outside pages are built from the live page.** Before CoderHelm writes or keeps a selector for a vendor page, it probes that page and records each test id's state and what clicking it brings up, and the PR quotes the probe. A test branch that no recorded run has taken is labelled unverified until the page can take it and it has run. Changes that only reformat a file are put back. ([#755](https://github.com/CoderHelm/coderhelm-platform/pull/755))
- **WAF alarms read their own evidence.** The read-only AWS role gains a scoped WAF policy, and an alarm run reads the requests its rule matched, including WAF logs kept in S3 through one bounded Athena query, before it plans the fix. When the role is missing those reads, the install shows one setup item with a one-line update, and the run carries on instead of asking a question. ([#757](https://github.com/CoderHelm/coderhelm-platform/pull/757))

## November 17, 2026: short replies, review rounds that agree, and red checks reproduced first

- **Short, plain replies on pull requests and tickets.** CoderHelm answers the newest comment in one line, with no quote, no "replying to" header, no repeated request, at most one mention, and never a link to the thread it is posted on. A branch update reads like `Merged main in (15401ad).` Every comment goes through the same check before it is posted. ([#752](https://github.com/CoderHelm/coderhelm-platform/pull/752))
- **Review rounds and planned work agree.** Work a review took out is not built again unless an acceptance criterion asks for it, and then the reply says which criterion. A fix round that answered its gaps with lookups or checks is judged on what it found, and the test environment comes from the CI job that tests the files being changed. ([#753](https://github.com/CoderHelm/coderhelm-platform/pull/753))

## November 17, 2026: the coder makes the smallest change

- **The coder makes the smallest change the ticket asks for.** Before planning, it searches the repository for the ticket's own names and reads what it extends. The plan must say what it reuses, what must not change, what to measure first and how it proves the work. A plan or diff is sent back when it adds a structure next to an existing one, deletes or replaces stored data the ticket never asked to touch, adds reporting nobody asked for, or changes a test to match an outside page when the product should change. The reviewer flags the same things. ([#742](https://github.com/CoderHelm/coderhelm-platform/pull/742))
- **Tests install once per run.** The test environment is installed on the first build and restored for every later build and the proof step, so fix rounds start faster. ([#742](https://github.com/CoderHelm/coderhelm-platform/pull/742))

## November 16, 2026 (after midnight): ticket answers, short descriptions and what a run waits on

- **Short, true pull request descriptions.** Descriptions follow Problem, Changes, Risk and Verification, drop items the latest checks have settled, and CoderHelm's commits are squashed into a few logical ones with the real ticket key. A person's commits are never rewritten. ([#737](https://github.com/CoderHelm/coderhelm-platform/pull/737))
- **Answers on the ticket decide the work.** Every answer and instruction on a ticket, from any run, is applied before planning and building, and an answered item is never listed as pending. Linked tickets' acceptance criteria are part of the plan and are checked before a pull request is ready. ([#744](https://github.com/CoderHelm/coderhelm-platform/pull/744))
- **The run page says what it is waiting on.** A line at the top names what a run waits on, and a preview block shows the preview link, its checks and screenshots. ([#438](https://github.com/CoderHelm/coderhelm/pull/438))

## November 16, 2026 (late night): previews, kept work, clean reviews and deploys followed

- **Web changes are proven on a preview.** CoderHelm reads the repository's workflows, starts the preview, runs the end-to-end tests for the changed area, captures the changed pages at desktop and phone width, and requires an end-to-end test for a visible change. Pull requests and run pages say in one line what they are waiting on. ([#734](https://github.com/CoderHelm/coderhelm-platform/pull/734))
- **CoderHelm's own limits never hand work to a person.** A security update with red CI keeps every green bump, notes the failing ones and marks the pull request ready; a long wait is retried instead of becoming a person's to-do; holds name a person only for an approval, a credential, access or a data-destroying change. Related packages move together. ([#739](https://github.com/CoderHelm/coderhelm-platform/pull/739))
- **A person's work on a pull request is kept.** CoderHelm never commits a change that undoes lines a person wrote; it keeps their version and asks in one note. Reverts touch only CoderHelm's own files, edits stay inside the plan, fix rounds edit the branch instead of restoring and rebuilding, and edit-then-undo commits are folded away. ([#743](https://github.com/CoderHelm/coderhelm-platform/pull/743))
- **One current review per pull request.** When CoderHelm reviews again, its earlier reviews shrink to one line, their comments are hidden as outdated, settled threads are resolved, and an old request for changes is dismissed. A person's review or unanswered reply is never touched. ([#746](https://github.com/CoderHelm/coderhelm-platform/pull/746))
- **Every merge is followed to its deploy.** Whoever merges a CoderHelm pull request, CoderHelm watches the staging deploy the change actually triggers, then prepares production by the repository's own path (for example its release tag), and says the result in one line. ([#748](https://github.com/CoderHelm/coderhelm-platform/pull/748))
- **Clearer alert cards and WAF evidence.** An alarm no rule names says so and links to add a rule; fix runs for firewall alarms start with a summary of the matching requests. ([#741](https://github.com/CoderHelm/coderhelm-platform/pull/741))

## November 16, 2026 (night): previews, honest descriptions and no hand-offs

- **Held pull requests are looked at again right after an update.** A hold decided by older code is re-decided on the next sweep, a sweep skipped for the GitHub request allowance runs again when it refills, and held drafts are checked first. ([#733](https://github.com/CoderHelm/coderhelm-platform/pull/733))
- **End-to-end results are read, not handed to a person.** CoderHelm reads results from checks, workflow runs, the pull request comment or the published report, and a missing GitHub permission is shown once for the install instead of on each pull request. ([#735](https://github.com/CoderHelm/coderhelm-platform/pull/735))

## November 16, 2026 (evening): CoderHelm proves web changes and keeps quiet

- **"What needs my answer?" covers everything waiting on you.** In any words, chat checks run questions, CoderHelm pull requests on your tickets, your Jira tickets and mentions, and GitHub reviews and failing checks, grouped by urgency with a link and what to do. ([#729](https://github.com/CoderHelm/coderhelm-platform/pull/729), [#436](https://github.com/CoderHelm/coderhelm/pull/436))
- **Read-only commands run instead of being refused.** A read-only curl or wget goes through CoderHelm's safe page check, setup chains run as one build, git history reads use CoderHelm's own tools, and anything still refused names what to use instead. Missing programs are noted once instead of retried. ([#732](https://github.com/CoderHelm/coderhelm-platform/pull/732))
- **One short status comment per pull request.** CoderHelm keeps a single status comment, edited in place, posts only when a person must act, writes it in a few plain lines, and hides its own older status comments as outdated. ([#736](https://github.com/CoderHelm/coderhelm-platform/pull/736))
- **The run log shows every command.** Refused or failed steps show the full command and the reason as they happen. ([#439](https://github.com/CoderHelm/coderhelm/pull/439))

## November 16, 2026 (afternoon): Knowledge search tabs, deleting many chats, and cleaner dialogs

- **Knowledge search tabs search right away.** Picking Code, Work, Logs or another base on the Knowledge page runs your search there at once and keeps what you typed; "Search Code" in a base's panel does the same. The last results stay on screen while new ones load. ([#433](https://github.com/CoderHelm/coderhelm/pull/433))
- **Delete several chats at once.** Choose Select in the chat list (or Shift-click a chat), tick the chats, and delete them together after one confirmation. Only your own chats can be selected. ([#434](https://github.com/CoderHelm/coderhelm/pull/434), [#728](https://github.com/CoderHelm/coderhelm-platform/pull/728))
- **Confirm dialogs without the empty band.** Yes or no questions no longer show an empty section between two lines, and on a phone they open as a short panel at the bottom. ([#434](https://github.com/CoderHelm/coderhelm/pull/434))
- **Everyone moved from hosted can get in.** A GitHub sign-in lands on the person's existing account instead of a second one made from their GitHub name, and people invited before the move get their invite from the install through "Forgot password" or "Send set-up emails to all". Refused sign-ins are logged by cause. ([#730](https://github.com/CoderHelm/coderhelm-platform/pull/730))

## November 16, 2026 (evening): set-up and reset emails reach people moved from hosted

- **Every install admin can send set-up emails.** The email relay now lists all of an install's owners and admins, including people copied over from hosted CoderHelm, and keeps that list in step when roles change. Sending a set-up email again no longer fails with "Something went wrong on our side"; if a send is refused, the page says why and what to do. ([#727](https://github.com/CoderHelm/coderhelm-platform/pull/727))
- **Unfinished sign-ups can start over.** Someone whose sign-up was never confirmed gets the set-up email from "Forgot password", and signing up again replaces the unconfirmed sign-up so the new password works. They land on their existing account. ([#727](https://github.com/CoderHelm/coderhelm-platform/pull/727))
- **Verification and reset codes use the install's own email.** The codes go out in the install's template instead of the plain default text. ([#727](https://github.com/CoderHelm/coderhelm-platform/pull/727))

## November 16, 2026 (later): CoderHelm finishes its own review findings

- **A finding answered with proof is reviewed again and closed.** When a fix round answers a review finding by running the checks on the latest commit instead of changing code, CoderHelm's reviewer looks at that same commit again with the round's evidence, and closes the finding when the proof holds. ([#726](https://github.com/CoderHelm/coderhelm-platform/pull/726))
- **Running out of time is never a reason to stop.** A check a step had no time to start is owed to the next step and runs first there; it no longer counts against the finding or hands the pull request to a person. ([#726](https://github.com/CoderHelm/coderhelm-platform/pull/726))
- **Pull requests end ready for review.** Anything truly left over after every approach is listed as CoderHelm's note on the pull request, which is marked ready instead of held as a draft. Pull requests already held this way recover on their own. ([#726](https://github.com/CoderHelm/coderhelm-platform/pull/726))

## November 16, 2026: plans that survive a cut answer, rebuilt descriptions, and a calmer update

- **A cut plan never replaces a good one.** When a plan revision runs out of room, CoderHelm continues it or repairs the missing part instead of throwing the plan away, so a run no longer fails with an empty plan. ([#720](https://github.com/CoderHelm/coderhelm-platform/pull/720))
- **Older pull request descriptions are rebuilt.** Open pull requests written by an earlier description writer, security fixes included, are rewritten fresh a few at a time, keeping their Closes and Fixes lines. ([#715](https://github.com/CoderHelm/coderhelm-platform/pull/715), [#720](https://github.com/CoderHelm/coderhelm-platform/pull/720))
- **Updates wait out a busy AWS.** When AWS turns calls away before an update has changed anything, the update waits and tries again by itself instead of asking you to press Update again. ([#722](https://github.com/CoderHelm/coderhelm-platform/pull/722))
- **The run page's Overview tab opens the Overview,** even on a run that is still planning. ([#429](https://github.com/CoderHelm/coderhelm/pull/429))
- **The team's bases as one overview.** Knowledge shows the six built-in bases on one screen with their numbers, one search across them, and each base's details in a side panel. ([#430](https://github.com/CoderHelm/coderhelm/pull/430))

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
