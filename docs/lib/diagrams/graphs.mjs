// @ts-check
// Every diagram on the site. A page shows one with <Diagram id="..."> and
// writes the same thing as a short list inside it, which is what the page's
// Markdown twin, llms.txt readers and screen readers get.
//
// Keep labels short (a box holds about 20 characters per line) and label
// each edge with what moves along it. lib/diagrams/layout.mjs explains rows,
// sets and how edges may run.

/** @type {Record<string, import('./types').Graph>} */
export const GRAPHS = {
  'how-it-works': {
    title: 'How work moves through CoderHelm',
    description:
      'Events from GitHub, Jira and alerts, and calls from the dashboard, reach the gateway. The gateway queues each job, a worker picks it up, and the agents read your code and team context, then open a pull request.',
    nodes: [
      { id: 'github', label: 'GitHub', detail: 'labeled issues, pushes', icon: 'git-pull-request' },
      { id: 'jira', label: 'Jira', detail: 'tickets, comments', icon: 'ticket' },
      { id: 'alerts', label: 'Alerts', detail: 'from your AWS account', icon: 'siren' },
      { id: 'dashboard', label: 'Dashboard', detail: 'you and your team', icon: 'layout-dashboard', tone: 'person' },
      { id: 'gateway', label: 'Gateway', detail: 'webhooks and the API', icon: 'webhook' },
      { id: 'queue', label: 'Queue', detail: 'one message per job', icon: 'list-ordered', tone: 'store' },
      { id: 'worker', label: 'Worker', detail: 'runs each job', icon: 'cpu' },
      { id: 'agents', label: 'Agents', detail: 'plan, code, review', icon: 'bot' },
      { id: 'code', label: 'Your code', icon: 'folder-git', tone: 'store' },
      { id: 'graph', label: 'Code graph', icon: 'waypoints', tone: 'store' },
      { id: 'memories', label: 'Memories', icon: 'brain', tone: 'store' },
      { id: 'skills', label: 'Skills', icon: 'book-open', tone: 'store' },
      { id: 'data', label: 'Data sources', icon: 'database', tone: 'store' },
      { id: 'connections', label: 'Connections', icon: 'plug', tone: 'store' },
      { id: 'pr', label: 'Pull request', detail: 'on your repo, for review', icon: 'git-pull-request', tone: 'result' },
    ],
    groups: [
      { id: 'sources', label: 'Where work starts', kind: 'set', columns: { wide: 2, narrow: 1 }, nodes: ['github', 'jira', 'alerts', 'dashboard'] },
      { id: 'coderhelm', label: 'CoderHelm', kind: 'row', tone: 'boundary', nodes: ['gateway', 'queue', 'worker', 'agents'] },
      {
        id: 'context',
        label: 'What the agents read',
        kind: 'set',
        columns: { wide: 3, narrow: 1 },
        nodes: ['code', 'graph', 'memories', 'skills', 'data', 'connections'],
      },
    ],
    order: ['sources', 'coderhelm', 'context', 'pr'],
    edges: [
      { from: 'sources', to: 'coderhelm', label: 'events and API calls' },
      { from: 'gateway', to: 'queue', label: 'enqueue' },
      { from: 'queue', to: 'worker', label: 'next job' },
      { from: 'worker', to: 'agents', label: 'starts' },
      { from: 'coderhelm', to: 'context', label: 'reads', dashed: true },
      { from: 'coderhelm', to: 'pr', label: 'opens' },
    ],
  },

  'plugin-run': {
    title: 'How a plugin run works',
    description:
      'A brief, a schedule or a release starts a run. The plugin agent works with only the tools its manifest grants and saves drafts. A person approves one exact version of a draft before it is published, now or at a set time.',
    nodes: [
      { id: 'brief', label: 'Brief', detail: 'a person asks', icon: 'message-square', tone: 'person' },
      { id: 'schedule', label: 'Schedule', icon: 'calendar-clock' },
      { id: 'release', label: 'Release', icon: 'tag' },
      { id: 'run', label: 'Plugin run', detail: 'pinned version, inputs, who asked', icon: 'play' },
      { id: 'agent', label: 'Plugin agent', detail: 'only the granted tools', icon: 'bot' },
      { id: 'drafts', label: 'Drafts', detail: 'in the review queue', icon: 'file-pen', tone: 'store' },
      { id: 'approval', label: 'Approval', detail: 'a person approves one exact version', icon: 'user-check', tone: 'person' },
      { id: 'now', label: 'Publish now', icon: 'send', tone: 'result' },
      { id: 'later', label: 'Publish at a set time', detail: 'can be cancelled until then', icon: 'calendar-clock', tone: 'result' },
    ],
    order: ['triggers', 'work', 'approval', 'out'],
    groups: [
      { id: 'triggers', label: 'What starts a run', kind: 'set', nodes: ['brief', 'schedule', 'release'] },
      { id: 'work', label: 'The run', kind: 'row', tone: 'boundary', nodes: ['run', 'agent', 'drafts'] },
      { id: 'out', label: 'What goes out', kind: 'set', columns: { wide: 2, narrow: 1 }, nodes: ['now', 'later'] },
    ],
    edges: [
      { from: 'triggers', to: 'work', label: 'starts' },
      { from: 'run', to: 'agent', label: 'runs' },
      { from: 'agent', to: 'drafts', label: 'saves' },
      { from: 'work', to: 'approval', label: 'waits for review' },
      { from: 'approval', to: 'out', label: 'that version only' },
    ],
  },

  'chat-answers': {
    title: 'How Chat answers a question',
    description:
      'Chat reads what the question needs from your own sources, gathers the passages that bear on it, and answers with a numbered citation on every claim. When nothing in your sources supports an answer, it says so.',
    nodes: [
      { id: 'question', label: 'Your question', detail: 'and files, if you attach them', icon: 'message-square', tone: 'person' },
      { id: 'repos', label: 'Repositories', icon: 'folder-git', tone: 'store' },
      { id: 'kb', label: 'Knowledge', icon: 'library', tone: 'store' },
      { id: 'connections', label: 'Connections', icon: 'plug', tone: 'store' },
      { id: 'memories', label: 'Memories', icon: 'brain', tone: 'store' },
      { id: 'data', label: 'Data sources', icon: 'database', tone: 'store' },
      { id: 'skills', label: 'Skills', icon: 'book-open', tone: 'store' },
      { id: 'search', label: 'Reads and searches', detail: 'over as many steps as needed', icon: 'search' },
      { id: 'passages', label: 'Passages', detail: 'with their file and lines, or page and date', icon: 'quote' },
      { id: 'answer', label: 'Answer', detail: 'a numbered citation on every claim', icon: 'sparkles', tone: 'result' },
      { id: 'none', label: 'Not in your sources', detail: 'said plainly, nothing made up', icon: 'circle-slash', tone: 'muted' },
    ],
    groups: [
      {
        id: 'sources',
        label: 'Your sources',
        kind: 'set',
        columns: { wide: 2, narrow: 1 },
        nodes: ['repos', 'kb', 'connections', 'memories', 'data', 'skills'],
      },
      { id: 'chat', label: 'Chat', kind: 'row', tone: 'boundary', nodes: ['search', 'passages'] },
    ],
    order: ['question', 'sources', 'chat', 'answer', 'none'],
    edges: [
      { from: 'question', to: 'chat', label: 'asks' },
      { from: 'sources', to: 'chat', label: 'read', dashed: true },
      { from: 'search', to: 'passages', label: 'finds' },
      { from: 'chat', to: 'answer', label: 'supported' },
      { from: 'chat', to: 'none', label: 'no support' },
    ],
  },
};
