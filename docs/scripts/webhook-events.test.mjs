import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEvents, eventsOf, exampleInOrder, renderWebhookEvents, ENVELOPE } from './lib/webhook-events.mjs';

const event = (type, group, extra = {}) => ({
  post: {
    summary: `Summary of ${type}`,
    description: `When ${type} happens. Sent as \`POST\` to each endpoint subscribed to \`${type}\` (or to every event).`,
    tags: [`Events: ${group}`],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            properties: {
              data: {
                required: ['run_id', 'pr_number'],
                properties: {
                  pr_number: { type: ['integer', 'null'], description: 'The pull request, `{n}`.' },
                  run_id: { type: 'string', description: 'The run | id.' },
                },
              },
            },
          },
          examples: { event: { value: { type, api_version: 'v', data: { pr_number: 1, run_id: 'r' }, id: 'evt_1' } } },
        },
      },
    },
    ...extra,
  },
});

const spec = () => ({
  webhooks: {
    'webhook.test': event('webhook.test', 'Testing'),
    'run.failed': event('run.failed', 'Runs'),
    'run.created': event('run.created', 'Runs'),
    'review.completed': event('review.completed', 'Reviews'),
  },
});

test('events are listed by group, then in the order things happen', () => {
  assert.deepEqual(eventsOf(spec()).map((e) => e.type), ['run.created', 'run.failed', 'review.completed', 'webhook.test']);
  assert.deepEqual(checkEvents(spec()), []);
});

test('the page has a section, a field table and the example for each event', () => {
  const md = renderWebhookEvents(spec());
  assert.match(md, /^### Runs\n\n#### `run.created`\n\nSummary of run.created\. When run.created happens\.\n/);
  assert.ok(!md.includes('Sent as `POST`'), 'how events are sent is said once, on the page');
  // Fields in the schema's own order, code spans kept, pipes escaped.
  assert.ok(md.indexOf('| `run_id` | string | The run \\| id. |') < md.indexOf('| `pr_number` | integer, or null | The pull request, `{n}`. |'));
  assert.ok(md.includes('```json\n{\n  "id": "evt_1",\n  "type": "run.created",'));
});

test('examples list the envelope in the documented order', () => {
  const [e] = eventsOf(spec());
  assert.deepEqual(Object.keys(exampleInOrder(e)), ['id', 'type', 'api_version', 'data']);
  assert.deepEqual(Object.keys(exampleInOrder(e).data), ['run_id', 'pr_number']);
  assert.deepEqual(ENVELOPE.slice(0, 2), ['id', 'type']);
});

test('a document without events, or with a broken one, is refused', () => {
  assert.deepEqual(checkEvents({}), ['the document has no `webhooks` section (no events to list)']);
  const s = spec();
  s.webhooks['run.failed'].post.requestBody.content['application/json'].examples.event.value.type = 'run.created';
  delete s.webhooks['run.created'].post.summary;
  const problems = checkEvents(s);
  assert.ok(problems.includes('run.failed: no example event of its own type'));
  assert.ok(problems.includes('run.created: no summary'));
});
