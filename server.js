require('dotenv').config();

const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { OPENAPI_URL, searchOperations } = require('./lib/procore-oas');
const { createEventLog, createWebhookHandler } = require('./lib/webhook');
const webhookHooks = require('./lib/webhook-hooks');
const { credentialProblem } = require('./lib/credentials');

const app = express();
const port = Number(process.env.PORT || 3001);
const authUrl = new URL(process.env.PROCORE_AUTH_URL || 'https://login-sandbox.procore.com');
const apiUrl = new URL(process.env.PROCORE_API_URL || 'https://sandbox.procore.com');
const outOfBandRedirectUri = process.env.PROCORE_REDIRECT_URI_OOB || 'urn:ietf:wg:oauth:2.0:oob';
const configuredRedirectUris = [
  process.env.PROCORE_REDIRECT_URI_LOCAL,
  process.env.PROCORE_REDIRECT_URI_CODESPACES,
  process.env.PROCORE_REDIRECT_URI
].filter(Boolean);

function getRedirectUri(req) {
  if (process.env.PROCORE_OAUTH_MODE === 'out_of_band') return outOfBandRedirectUri;

  const hostname = req.hostname.toLowerCase();
  const matchingUri = configuredRedirectUris.find(uri => new URL(uri).hostname.toLowerCase() === hostname);
  if (matchingUri) return matchingUri;
  if (configuredRedirectUris.length === 0 && hostname === 'localhost') {
    return `http://localhost:${port}/oauth/callback`;
  }
  return null;
}

function normalizeGitHubRemote(remote) {
  const sshMatch = remote.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;

  try {
    const url = new URL(remote);
    const [owner, repository] = url.pathname.replace(/^\//, '').split('/');
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !owner || !repository) return null;
    return `https://github.com/${owner}/${repository.replace(/\.git$/, '')}`;
  } catch {
    return null;
  }
}

function getRepositoryStatus() {
  let repositoryUrl = null;
  let statusLines = [];
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    repositoryUrl = normalizeGitHubRemote(remote);
    statusLines = execFileSync('git', ['status', '--short', '--branch'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return { repositoryUrl, hasUncommittedChanges: false, hasUpstream: false, ahead: 0, behind: 0 };
  }

  const branchStatus = statusLines[0] || '';
  const ahead = Number(branchStatus.match(/\[ahead (\d+)/)?.[1] || 0);
  const behind = Number(branchStatus.match(/\[behind (\d+)/)?.[1] || 0);
  return {
    repositoryUrl,
    hasUncommittedChanges: statusLines.length > 1,
    hasUpstream: branchStatus.includes('...'),
    ahead,
    behind
  };
}

app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// The one place that calls the Procore API. Every API route should go through it so the
// required headers are never forgotten.
//   companyId  Required for every endpoint except GET /rest/v1.0/me and GET /rest/v1.0/companies.
//              Sent as the Procore-Company-Id header (and still pass company_id in the path/query/body
//              if the endpoint asks for it).
//   method     HTTP method, default GET.
//   body       Plain object, sent as JSON.
async function procoreRequest(req, endpoint, { companyId, method = 'GET', body } = {}) {
  const accessToken = req.session.procoreToken?.access_token;
  if (!accessToken) {
    return { status: 401, data: { error: 'Connect to the Procore Sandbox first.' } };
  }

  const response = await fetch(new URL(endpoint, apiUrl), {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(companyId ? { 'Procore-Company-Id': String(companyId) } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = { error: 'Procore returned an unexpected response.' };
  }

  // Pagination (Link, Total, Per-Page) and rate limit (X-Rate-Limit-*) headers come back on every response.
  // 429 means wait until rateLimit.reset (Unix seconds) before retrying; 503 means wait Retry-After seconds.
  const header = name => response.headers.get(name);
  return {
    status: response.status,
    data,
    pagination: { link: header('Link'), total: header('Total'), perPage: header('Per-Page') },
    rateLimit: {
      limit: header('X-Rate-Limit-Limit'),
      remaining: header('X-Rate-Limit-Remaining'),
      reset: header('X-Rate-Limit-Reset'),
      retryAfter: header('Retry-After')
    }
  };
}

async function exchangeAuthorizationCode(req, res, code, redirectUri) {
  const jsonResponse = req.get('accept')?.includes('application/json');
  if (credentialProblem()) {
    const message = credentialProblem();
    return jsonResponse ? res.status(500).json({ error: message }) : res.status(500).send(message);
  }

  try {
    const tokenResponse = await fetch(new URL('/oauth/token/', authUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.PROCORE_CLIENT_ID,
        client_secret: process.env.PROCORE_CLIENT_SECRET,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      console.error('Procore token exchange failed:', tokenResponse.status, await tokenResponse.text());
      const message = 'Procore rejected the code exchange. Start a fresh authorization and try again.';
      return jsonResponse ? res.status(502).json({ error: message }) : res.status(502).send(message);
    }

    req.session.procoreToken = await tokenResponse.json();
    if (jsonResponse) return res.json({ connected: true });
    res.redirect(303, '/?connected=1');
  } catch (error) {
    console.error('Procore token exchange error:', error);
    const message = 'Could not complete the Procore token exchange. Check the server log.';
    if (jsonResponse) return res.status(502).json({ error: message });
    res.status(502).send(message);
  }
}

app.get('/api/session', (req, res) => {
  const token = req.session.procoreToken;
  res.json({
    connected: Boolean(token?.access_token),
    environment: 'Sandbox',
    expiresIn: token?.expires_in || null
  });
});

app.get('/api/repository', (req, res) => {
  if (!req.session.procoreToken?.access_token) {
    return res.status(401).json({ error: 'Connect to the Procore Sandbox first.' });
  }
  res.json(getRepositoryStatus());
});

app.get('/api/companies', async (req, res) => {
  try {
    const result = await procoreRequest(req, '/rest/v1.0/companies');
    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Procore companies request failed:', error);
    res.status(502).json({ error: 'Could not load Sandbox companies. Check the server log.' });
  }
});

app.get('/api/projects', async (req, res) => {
  const companyId = String(req.query.company_id || '');
  if (!/^\d+$/.test(companyId)) {
    return res.status(400).json({ error: 'Choose a valid company first.' });
  }

  try {
    const endpoint = `/rest/v1.1/projects?${new URLSearchParams({ company_id: companyId })}`;
    const result = await procoreRequest(req, endpoint, { companyId });
    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Procore projects request failed:', error);
    res.status(502).json({ error: 'Could not load Sandbox projects. Check the server log.' });
  }
});

app.get('/api/catalog/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.status(400).json({ error: 'Enter at least two characters to search the API catalog.' });
  }

  try {
    const results = await searchOperations(query);
    res.json({ query, source: OPENAPI_URL, results });
  } catch (error) {
    console.error('Procore OpenAPI search failed:', error);
    res.status(502).json({ error: 'Could not load Procore API reference. Try again shortly.' });
  }
});

app.get('/login', (req, res) => {
  if (credentialProblem()) {
    return res.status(500).send(credentialProblem());
  }

  const redirectUri = getRedirectUri(req);
  if (!redirectUri) {
    return res.status(400).send('No Procore redirect URI is configured for this host.');
  }

  const state = crypto.randomBytes(32).toString('hex');
  req.session.oauthState = state;
  req.session.oauthRedirectUri = redirectUri;

  const authorizationUrl = new URL('/oauth/authorize', authUrl);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.PROCORE_CLIENT_ID,
    redirect_uri: redirectUri,
    state
  }).toString();

  res.redirect(authorizationUrl.toString());
});

app.get('/oauth/callback', async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(`Procore authorization failed: ${req.query.error}`);
  }

  const { code, state } = req.query;
  const redirectUri = req.session.oauthRedirectUri;
  if (!code || !state || state !== req.session.oauthState || !redirectUri || redirectUri === outOfBandRedirectUri) {
    return res.status(400).send('Invalid OAuth callback. Start again at /login.');
  }
  delete req.session.oauthState;
  delete req.session.oauthRedirectUri;

  return exchangeAuthorizationCode(req, res, String(code), redirectUri);
});

app.get('/oauth/code', (req, res) => {
  if (req.session.oauthRedirectUri !== outOfBandRedirectUri || !req.session.oauthState) {
    return res.redirect(303, '/#code-entry');
  }
  return res.redirect(303, '/#code-entry');
});

app.post('/oauth/code', async (req, res) => {
  const jsonResponse = req.get('accept')?.includes('application/json');
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  if (!code || req.session.oauthRedirectUri !== outOfBandRedirectUri || !req.session.oauthState) {
    const message = 'No active authorization was found. Start again with Connect to Sandbox.';
    return jsonResponse ? res.status(400).json({ error: message }) : res.status(400).send(message);
  }

  delete req.session.oauthState;
  delete req.session.oauthRedirectUri;
  return exchangeAuthorizationCode(req, res, code, outOfBandRedirectUri);
});

// Optional webhook listener (bonus exercise). It runs on its own port so that only this one
// route needs to be public; the dashboard on `port` can stay private. Off unless WEBHOOK_SECRET is set.
const webhookSecret = process.env.WEBHOOK_SECRET || '';
const webhookPort = Number(process.env.WEBHOOK_PORT || 3002);
const webhookLog = createEventLog(50);

function getWebhookListenerUrl() {
  const { CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
  if (CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${CODESPACE_NAME}-${webhookPort}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/webhooks/procore`;
  }
  return `http://localhost:${webhookPort}/webhooks/procore`;
}

app.get('/api/webhook-events', (req, res) => {
  if (!req.session.procoreToken) {
    return res.status(401).json({ error: 'Connect to the Procore Sandbox first.' });
  }
  res.json({
    enabled: Boolean(webhookSecret),
    listenerUrl: getWebhookListenerUrl(),
    hook: req.session.webhookHook || null,
    events: webhookLog.list()
  });
});

// Registers (and removes) the bonus webhook from the dashboard. Nothing is sent to Procore without
// `confirm: true`, and only the hook this session created can be deleted.
function webhookHookGuard(req, res) {
  if (!req.session.procoreToken) {
    res.status(401).json({ error: 'Connect to the Procore Sandbox first.' });
    return false;
  }
  if (!webhookSecret) {
    res.status(400).json({ error: 'Set WEBHOOK_SECRET and restart to enable the webhook bonus.' });
    return false;
  }
  return true;
}

function describeProcoreFailure(result, action) {
  const detail = [result.data?.message, result.data?.error, result.data?.errors && JSON.stringify(result.data.errors)]
    .filter(value => typeof value === 'string' && value)[0];
  const hint = result.status === 403 || result.status === 401
    ? ' Check that the app\'s Webhooks API permission is set to Standard in the Developer Portal.'
    : '';
  return `${action} failed (${result.status}${detail ? `: ${detail.slice(0, 300)}` : ''}).${hint}`;
}

app.get('/api/webhook-hook/preview', (req, res) => {
  if (!webhookHookGuard(req, res)) return;
  try {
    res.json(webhookHooks.describeCreateHook({
      companyId: String(req.query.company_id || ''),
      projectId: String(req.query.project_id || ''),
      listenerUrl: getWebhookListenerUrl()
    }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/webhook-hook', express.json({ limit: '4kb' }), async (req, res) => {
  if (!webhookHookGuard(req, res)) return;
  const companyId = String(req.body?.company_id || '');
  const projectId = String(req.body?.project_id || '');
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: 'Tick the confirmation box to create the webhook.' });
  }
  const listenerUrl = getWebhookListenerUrl();
  const urlProblem = webhookHooks.validateListenerUrl(listenerUrl);
  if (urlProblem) return res.status(400).json({ error: urlProblem });

  try {
    const hookRequest = webhookHooks.buildCreateHookRequest({ companyId, projectId, listenerUrl, secret: webhookSecret });
    const hookResult = await procoreRequest(req, hookRequest.endpoint, { companyId, method: 'POST', body: hookRequest.body });
    const hookId = String(hookResult.data?.data?.id || '');
    if (hookResult.status >= 300 || !hookId) {
      return res.status(502).json({ error: describeProcoreFailure(hookResult, 'Creating the webhook') });
    }
    req.session.webhookHook = { companyId, projectId, hookId };

    const triggerRequest = webhookHooks.buildCreateTriggersRequest({ companyId, projectId, hookId });
    const triggerResult = await procoreRequest(req, triggerRequest.endpoint, { companyId, method: 'POST', body: triggerRequest.body });
    if (triggerResult.status >= 300) {
      return res.status(502).json({
        hookId,
        error: `${describeProcoreFailure(triggerResult, 'Adding triggers')} The hook was created without triggers; delete it and try again.`
      });
    }
    res.status(201).json({ hookId, triggerCount: webhookHooks.DEFAULT_TRIGGERS.length });
  } catch (error) {
    console.error('Webhook registration failed:', error);
    res.status(502).json({ error: 'Could not register the webhook. Check the server log.' });
  }
});

app.delete('/api/webhook-hook', async (req, res) => {
  if (!webhookHookGuard(req, res)) return;
  const hook = req.session.webhookHook;
  if (!hook) return res.status(404).json({ error: 'This session has not created a webhook.' });
  try {
    const request = webhookHooks.buildDeleteHookRequest(hook);
    const result = await procoreRequest(req, request.endpoint, { companyId: hook.companyId, method: 'DELETE' });
    if (result.status >= 300 && result.status !== 404) {
      return res.status(502).json({ error: describeProcoreFailure(result, 'Deleting the webhook') });
    }
    delete req.session.webhookHook;
    res.json({ deleted: true });
  } catch (error) {
    console.error('Webhook delete failed:', error);
    res.status(502).json({ error: 'Could not delete the webhook. Check the server log.' });
  }
});

app.listen(port, () => {
  console.log(`Local app listening at http://localhost:${port}`);
  const { CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
  if (CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    const appUrl = `https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
    console.log(`Open the app in your browser: ${appUrl}`);
    // Codespaces terminals set $BROWSER to a helper that opens a new tab. Set NO_AUTO_OPEN=1 to skip this.
    if (process.env.BROWSER && !process.env.NO_AUTO_OPEN) {
      execFile(process.env.BROWSER, [appUrl], { timeout: 10000 }, error => {
        if (error) console.log('Could not open a browser tab automatically. Use the URL above or the Ports tab.');
      });
    }
  }
  const problem = credentialProblem();
  if (problem) console.warn(`\nWARNING: ${problem}\n`);
});

if (webhookSecret) {
  const webhookApp = express();
  webhookApp.disable('x-powered-by');
  webhookApp.post('/webhooks/procore', express.json({ limit: '16kb' }), createWebhookHandler({ secret: webhookSecret, log: webhookLog }));
  // Anything else, including bad JSON, gets a bare error and no detail.
  webhookApp.use((error, req, res, next) => res.status(400).end());
  webhookApp.use((req, res) => res.status(404).end());
  webhookApp.listen(webhookPort, () => {
    console.log(`Webhook listener on port ${webhookPort}: ${getWebhookListenerUrl()}`);
  });
} else {
  console.log('Webhook listener is off. Set WEBHOOK_SECRET to enable the bonus exercise.');
}