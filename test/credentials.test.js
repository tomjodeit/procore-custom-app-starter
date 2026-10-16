const test = require('node:test');
const assert = require('node:assert/strict');
const { credentialProblem } = require('../lib/credentials');

const real = { PROCORE_CLIENT_ID: 'abc123', PROCORE_CLIENT_SECRET: 'def456' };

test('real credentials are accepted', () => {
  assert.equal(credentialProblem(real), null);
});

test('missing or empty credentials are reported', () => {
  assert.match(credentialProblem({}), /\.env/);
  assert.match(credentialProblem({ ...real, PROCORE_CLIENT_SECRET: '' }), /\.env/);
});

test('placeholders copied from .env.example count as missing', () => {
  const placeholders = { PROCORE_CLIENT_ID: 'your-sandbox-client-id', PROCORE_CLIENT_SECRET: 'your-sandbox-client-secret' };
  assert.ok(credentialProblem(placeholders));
  assert.ok(credentialProblem({ ...real, PROCORE_CLIENT_ID: 'your-sandbox-client-id' }));
});

test('inside a Codespace the message points at Codespaces secrets', () => {
  const message = credentialProblem({ CODESPACE_NAME: 'x' });
  assert.match(message, /Codespaces secrets/);
  assert.match(message, /Rebuild/);
});
