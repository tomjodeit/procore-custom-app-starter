// Pure builders for the two Procore calls that register a project webhook. Kept free of Express and fetch
// so they can be unit tested. Endpoints and bodies follow the v2.0 Webhooks API.
const NAMESPACE = 'procore-starter';
const PAYLOAD_VERSION = 'v4.0';

// Low-friction triggers: each one fires from a simple click in the Procore web UI.
const DEFAULT_TRIGGERS = [
  { resource_name: 'Project Dates', event_type: 'create' },
  { resource_name: 'Project Dates', event_type: 'update' },
  { resource_name: 'Project Dates', event_type: 'delete' },
  { resource_name: 'Project Configuration', event_type: 'update' },
  { resource_name: 'Project Files', event_type: 'create' },
  { resource_name: 'Project Files', event_type: 'update' },
  { resource_name: 'Project Files', event_type: 'delete' },
  { resource_name: 'Project Folders', event_type: 'create' },
  { resource_name: 'Project Folders', event_type: 'update' },
  { resource_name: 'Project Folders', event_type: 'delete' }
];

const isId = value => typeof value === 'string' && /^\d+$/.test(value);

function hooksPath(companyId, projectId) {
  if (!isId(companyId) || !isId(projectId)) throw new Error('Choose a company and a project first.');
  return `/rest/v2.0/companies/${companyId}/projects/${projectId}/webhooks/hooks`;
}

// Procore must reach this URL from the internet, so only public https URLs make sense.
function validateListenerUrl(listenerUrl) {
  let url;
  try {
    url = new URL(listenerUrl);
  } catch {
    return 'The listener URL is not valid.';
  }
  const host = url.hostname;
  if (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.localhost') || /^(127\.|10\.|192\.168\.)/.test(host)) {
    return 'Procore needs a public https URL. In a Codespace, make port 3002 Public first. A localhost listener cannot receive events.';
  }
  return null;
}

function buildCreateHookRequest({ companyId, projectId, listenerUrl, secret }) {
  return {
    endpoint: hooksPath(companyId, projectId),
    body: {
      payload_version: PAYLOAD_VERSION,
      namespace: NAMESPACE,
      destination_url: listenerUrl,
      destination_headers: { Authorization: `Bearer ${secret}` }
    }
  };
}

function buildCreateTriggersRequest({ companyId, projectId, hookId }) {
  if (!isId(hookId)) throw new Error('Missing hook ID.');
  return { endpoint: `${hooksPath(companyId, projectId)}/${hookId}/triggers/bulk`, body: DEFAULT_TRIGGERS };
}

function buildDeleteHookRequest({ companyId, projectId, hookId }) {
  if (!isId(hookId)) throw new Error('Missing hook ID.');
  return { endpoint: `${hooksPath(companyId, projectId)}/${hookId}` };
}

// What the dashboard shows before anything is sent. The secret is never included.
function describeCreateHook({ companyId, projectId, listenerUrl }) {
  const { endpoint, body } = buildCreateHookRequest({ companyId, projectId, listenerUrl, secret: '<hidden>' });
  return {
    hook: { method: 'POST', endpoint, body: { ...body, destination_headers: { Authorization: 'Bearer <hidden>' } } },
    triggers: DEFAULT_TRIGGERS
  };
}

module.exports = {
  NAMESPACE,
  PAYLOAD_VERSION,
  DEFAULT_TRIGGERS,
  validateListenerUrl,
  buildCreateHookRequest,
  buildCreateTriggersRequest,
  buildDeleteHookRequest,
  describeCreateHook
};
