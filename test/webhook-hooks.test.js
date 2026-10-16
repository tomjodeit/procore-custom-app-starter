const test = require('node:test');
const assert = require('node:assert/strict');
const hooks = require('../lib/webhook-hooks');

const ids = { companyId: '111', projectId: '222' };
const url = 'https://abc-3002.app.github.dev/webhooks/procore';

test('create hook matches the v2.0 project hook contract', () => {
  const { endpoint, body } = hooks.buildCreateHookRequest({ ...ids, listenerUrl: url, secret: 's3cret' });
  assert.equal(endpoint, '/rest/v2.0/companies/111/projects/222/webhooks/hooks');
  assert.deepEqual(body, {
    payload_version: 'v4.0',
    namespace: 'procore-starter',
    destination_url: url,
    destination_headers: { Authorization: 'Bearer s3cret' }
  });
  assert.match(body.namespace, /^[a-z0-9-]+$/);
});

test('triggers use the bulk endpoint with an array of resource/event pairs', () => {
  const { endpoint, body } = hooks.buildCreateTriggersRequest({ ...ids, hookId: '999' });
  assert.equal(endpoint, '/rest/v2.0/companies/111/projects/222/webhooks/hooks/999/triggers/bulk');
  assert.ok(Array.isArray(body) && body.length > 0);
  for (const trigger of body) {
    assert.deepEqual(Object.keys(trigger).sort(), ['event_type', 'resource_name']);
    assert.ok(['create', 'update', 'delete'].includes(trigger.event_type));
  }
  const names = new Set(body.map(t => t.resource_name));
  for (const expected of ['Project Dates', 'Project Files', 'Project Folders']) assert.ok(names.has(expected));
});

test('delete hook path', () => {
  assert.equal(
    hooks.buildDeleteHookRequest({ ...ids, hookId: '999' }).endpoint,
    '/rest/v2.0/companies/111/projects/222/webhooks/hooks/999'
  );
});

test('non-numeric IDs are rejected (no path injection)', () => {
  assert.throws(() => hooks.buildCreateHookRequest({ companyId: '1/../2', projectId: '2', listenerUrl: url, secret: 'x' }));
  assert.throws(() => hooks.buildCreateHookRequest({ companyId: '1', projectId: '', listenerUrl: url, secret: 'x' }));
  assert.throws(() => hooks.buildDeleteHookRequest({ ...ids, hookId: '9?x=1' }));
});

test('listener URL must be public https', () => {
  assert.equal(hooks.validateListenerUrl(url), null);
  assert.match(hooks.validateListenerUrl('http://localhost:3002/webhooks/procore'), /public https/);
  assert.match(hooks.validateListenerUrl('http://abc.example.com/x'), /public https/);
  assert.match(hooks.validateListenerUrl('not a url'), /not valid/);
});

test('the preview never contains the secret', () => {
  const preview = JSON.stringify(hooks.describeCreateHook({ ...ids, listenerUrl: url }));
  assert.ok(!preview.includes('s3cret'));
  assert.ok(preview.includes('<hidden>'));
});
