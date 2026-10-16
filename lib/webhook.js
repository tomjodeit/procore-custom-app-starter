const crypto = require('node:crypto');

// A deliberately small webhook receiver for the starter. It shows the shape of a secure listener:
// verify the shared secret, validate the payload, ignore duplicates, acknowledge fast, process later.
// Events are kept in memory only. A production listener would put them on a queue or in a database.

// Compare secrets without leaking length or position through timing.
function verifyAuthorization(headerValue, secret) {
  if (!secret || typeof headerValue !== 'string' || !headerValue) return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(headerValue), digest(secret));
}

// Accepts the v4.0 payload format: all-string IDs, `reason` instead of `event_type`, `resource_type`.
function parseEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const text = value => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
  const event = {
    id: text(body.id),
    timestamp: text(body.timestamp),
    reason: text(body.reason),
    resourceType: text(body.resource_type),
    resourceId: text(body.resource_id),
    companyId: text(body.company_id),
    projectId: text(body.project_id)
  };
  if (!event.id || !event.reason || !event.resourceType) return null;
  return event;
}

// Newest-first log with a size cap and de-duplication by event ID (Procore can deliver an event more than once).
function createEventLog(limit = 50) {
  const events = [];
  const seen = new Set();
  return {
    add(event) {
      if (seen.has(event.id)) return 'duplicate';
      seen.add(event.id);
      events.unshift({ ...event, receivedAt: new Date().toISOString() });
      while (events.length > limit) seen.delete(events.pop().id);
      return 'added';
    },
    list() {
      return events.slice();
    }
  };
}

// Express-style handler. `secret` is a random string; Procore must send it as `Authorization: Bearer <secret>`
// (set in the hook's destination_headers). Replies 401 before reading the body, 400 for payloads that are not v4.0 events,
// and 204 right away on success (Procore times out after 5 seconds).
function createWebhookHandler({ secret, log }) {
  return function handleWebhook(req, res) {
    if (!verifyAuthorization(req.get('authorization'), `Bearer ${secret}`)) {
      return res.status(401).end();
    }
    const event = parseEvent(req.body);
    if (!event) {
      return res.status(400).json({ error: 'Expected a Procore v4.0 webhook payload.' });
    }
    log.add(event);
    return res.status(204).end();
  };
}

module.exports = { verifyAuthorization, parseEvent, createEventLog, createWebhookHandler };
