import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpec, operationsOf } from './lib/openapi.mjs';

const good = () => ({
  openapi: '3.1.0',
  info: { title: 'CoderHelm API', version: '1.0.0' },
  servers: [{ url: 'https://api.coderhelm.com' }],
  tags: [{ name: 'Runs' }],
  paths: {
    '/api/runs': { get: { operationId: 'listRuns', summary: 'List runs', tags: ['Runs'], responses: { 200: { description: 'ok' } } } },
  },
});

test('a complete document passes', () => {
  assert.deepEqual(checkSpec(good()), []);
  assert.deepEqual(operationsOf(good()), [{ method: 'GET', path: '/api/runs', tag: 'Runs', summary: 'List runs' }]);
});

test('each gap is named', () => {
  const spec = good();
  spec.openapi = '3.0.3';
  spec.paths['/api/runs'].get.tags = ['Nope'];
  delete spec.paths['/api/runs'].get.summary;
  spec.paths['/api/x'] = { post: { operationId: 'listRuns', tags: ['Runs'], summary: 's', responses: { 400: {} } } };
  const problems = checkSpec(spec);
  assert.ok(problems.some((p) => p.includes('expected 3.1')));
  assert.ok(problems.some((p) => p.includes('tag Nope is not described')));
  assert.ok(problems.some((p) => p.includes('no summary')));
  assert.ok(problems.some((p) => p.includes('used twice')));
  assert.ok(problems.some((p) => p.includes('POST /api/x: no success response')));
  assert.deepEqual(checkSpec({ ...good(), paths: {} }), ['no operations']);
});
