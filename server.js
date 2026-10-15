require('dotenv').config();

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { OPENAPI_URL, searchOperations } = require('./lib/procore-oas');

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

async function getProcoreData(req, endpoint, headers = {}) {
  const accessToken = req.session.procoreToken?.access_token;
  if (!accessToken) {
    return { status: 401, data: { error: 'Connect to the Procore Sandbox first.' } };
  }

  const response = await fetch(new URL(endpoint, apiUrl), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...headers
    }
  });
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = { error: 'Procore returned an unexpected response.' };
  }
  return { status: response.status, data };
}

async function exchangeAuthorizationCode(req, res, code, redirectUri) {
  const jsonResponse = req.get('accept')?.includes('application/json');
  if (!process.env.PROCORE_CLIENT_ID || !process.env.PROCORE_CLIENT_SECRET) {
    const message = 'Set the Procore client ID and secret in your .env file.';
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
    const result = await getProcoreData(req, '/rest/v1.0/companies');
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
    const result = await getProcoreData(req, endpoint, { 'Procore-Company-Id': companyId });
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
  if (!process.env.PROCORE_CLIENT_ID) {
    return res.status(500).send('Set PROCORE_CLIENT_ID in your .env file first.');
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

app.listen(port, () => {
  console.log(`Local app listening at http://localhost:${port}`);
});