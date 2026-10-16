const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAuthorization, parseEvent, createEventLog, createWebhookHandler } = require('../lib/webhook');

const v4 = {
  id: '01JMYXMZRBVKK0PC6XS8SA4QRE',
  timestamp: '2025-02-25T16:04:43.619085Z',
  reason: 'update',
  company_id: '8',
  project_id: '6778',
  user_id: '5447',
  resource_type: 'Project Dates',
  resource_id: '379913'
};

function call(handler, { auth, body }) {
  const res = { statusCode: null, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = payload => { res.body = payload; return res; };
  res.end = () => res;
  handler({ get: name => (name === 'authorization' ? auth : undefined), body }, res);
  return res;
}

test('verifyAuthorization accepts only the exact secret', () => {
  assert.equal(verifyAuthorization('Bearer s3cret', 'Bearer s3cret'), true);
  assert.equal(verifyAuthorization('Bearer s3cret!', 'Bearer s3cret'), false);
  assert.equal(verifyAuthorization('', 'Bearer s3cret'), false);
  assert.equal(verifyAuthorization(undefined, 'Bearer s3cret'), false);
  assert.equal(verifyAuthorization('anything', ''), false, 'an unset secret never authorizes');
});

test('parseEvent normalizes a v4.0 payload and rejects junk', () => {
  assert.deepEqual(parseEvent(v4), {
    id: v4.id,
    timestamp: v4.timestamp,
    reason: 'update',
    resourceType: 'Project Dates',
    resourceId: '379913',
    companyId: '8',
    projectId: '6778'
  });
  assert.equal(parseEvent(null), null);
  assert.equal(parseEvent([]), null);
  assert.equal(parseEvent({ id: '1' }), null);
  assert.equal(parseEvent({ ...v4, id: undefined }), null);
});

test('event log de-duplicates by id, is newest first, and is capped', () => {
  const log = createEventLog(3);
  assert.equal(log.add({ id: 'a' }), 'added');
  assert.equal(log.add({ id: 'a' }), 'duplicate');
  log.add({ id: 'b' });
  log.add({ id: 'c' });
  log.add({ id: 'd' });
  assert.deepEqual(log.list().map(e => e.id), ['d', 'c', 'b']);
  assert.equal(log.add({ id: 'a' }), 'added', 'an evicted id can be accepted again');
});

test('handler: 401 without the secret and nothing is stored', () => {
  const log = createEventLog();
  const handler = createWebhookHandler({ secret: 's3cret', log });
  assert.equal(call(handler, { auth: undefined, body: v4 }).statusCode, 401);
  assert.equal(call(handler, { auth: 'Bearer wrong', body: v4 }).statusCode, 401);
  assert.equal(log.list().length, 0);
});

test('handler: 400 for a body that is not a v4.0 event', () => {
  const log = createEventLog();
  const handler = createWebhookHandler({ secret: 's3cret', log });
  assert.equal(call(handler, { auth: 'Bearer s3cret', body: { hello: 'world' } }).statusCode, 400);
  assert.equal(log.list().length, 0);
});

test('handler: 204 and stored once even if delivered twice', () => {
  const log = createEventLog();
  const handler = createWebhookHandler({ secret: 's3cret', log });
  assert.equal(call(handler, { auth: 'Bearer s3cret', body: v4 }).statusCode, 204);
  assert.equal(call(handler, { auth: 'Bearer s3cret', body: v4 }).statusCode, 204);
  assert.equal(log.list().length, 1);
  assert.equal(log.list()[0].resourceType, 'Project Dates');
});
