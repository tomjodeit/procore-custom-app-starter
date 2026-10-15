const OPENAPI_URL = 'https://developers.procore.com/api/v1/resource_groups/full_oas';
const SEARCH_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const SYNC_PROJECTS_DOCS = 'https://developers.procore.com/reference/rest/projects?version=latest#sync-projects';

let openApiPromise;

async function loadOpenApi() {
  if (!openApiPromise) {
    openApiPromise = (async () => {
      const response = await fetch(OPENAPI_URL, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`OpenAPI download failed (${response.status}).`);
      return response.json();
    })();
  }

  try {
    return await openApiPromise;
  } catch (error) {
    openApiPromise = undefined;
    throw error;
  }
}

function resolveComponent(reference, components, depth = 0) {
  if (depth > 4 || !reference?.$ref) return reference;
  const path = reference.$ref.replace(/^#\//, '').split('/');
  let resolved = components;
  for (const segment of path.slice(1)) resolved = resolved?.[segment];
  return resolved || reference;
}

function summarizeBody(operation, spec) {
  let requestBody = operation.requestBody;
  if (requestBody?.$ref) requestBody = resolveComponent(requestBody, spec.components);
  const media = requestBody?.content?.['application/json'];
  let schema = media?.schema;
  if (schema?.$ref) schema = resolveComponent(schema, spec.components);
  if (!schema) return undefined;

  const fields = [];
  const addProperties = (parentSchema, prefix = '', depth = 0) => {
    if (!parentSchema || depth > 2) return;
    if (parentSchema.$ref) parentSchema = resolveComponent(parentSchema, spec.components);
    const required = new Set(parentSchema.required || []);
    for (const [name, property] of Object.entries(parentSchema.properties || {})) {
      const fieldName = `${prefix}${name}`;
      const resolved = property.$ref ? resolveComponent(property, spec.components) : property;
      fields.push({ name: fieldName, type: resolved.type || 'object', required: required.has(name) });
      if (resolved.type === 'array' && resolved.items) {
        const itemSchema = resolved.items.$ref ? resolveComponent(resolved.items, spec.components) : resolved.items;
        addProperties(itemSchema, `${fieldName}[].`, depth + 1);
      } else if (resolved.properties) {
        addProperties(resolved, `${fieldName}.`, depth + 1);
      }
      if (fields.length >= 40) return;
    }
  };
  addProperties(schema);

  return {
    required: Boolean(requestBody.required),
    mediaType: 'application/json',
    fields,
    requiredFields: schema.required || []
  };
}

function operationDocumentationUrl(method, path) {
  if (method === 'patch' && path === '/rest/v1.0/projects/sync') return SYNC_PROJECTS_DOCS;
  return OPENAPI_URL;
}

function createOperation(method, path, operation, spec) {
  const description = String(operation.description || '').replace(/\r/g, '').trim();
  const parameters = (operation.parameters || []).map(parameter => ({
    name: parameter.name,
    in: parameter.in,
    required: Boolean(parameter.required)
  }));
  const cautionHeading = description.search(/recommendation|warning|caution/i);
  return {
    method,
    path,
    summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
    description: description.slice(0, 1200),
    caution: cautionHeading >= 0 ? description.slice(cautionHeading).slice(0, 700) : '',
    parameters,
    requestBody: summarizeBody(operation, spec),
    documentationUrl: operationDocumentationUrl(method, path)
  };
}

async function searchOperations(query, limit = 8) {
  const spec = await loadOpenApi();
  const terms = query.toLowerCase().split(/[^a-z0-9_.-]+/).filter(term => term.length > 1);
  const projectSyncIntent = /\bprojects?\b/i.test(query)
    && /\b(create|new|batch|excel|spreadsheet|import|sync|automation)\b/i.test(query);
  const matches = [];

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!SEARCH_METHODS.has(method)) continue;
      const searchable = [path, operation.summary, operation.operationId, operation.description, ...(operation.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (path.toLowerCase().includes(term)) score += 6;
        else if ((operation.summary || '').toLowerCase().includes(term)) score += 4;
        else if ((operation.tags || []).some(tag => tag.toLowerCase().includes(term))) score += 2;
        else if (searchable.includes(term)) score += 1;
      }
      if (projectSyncIntent && method === 'patch' && path === '/rest/v1.0/projects/sync') score += 40;
      if (score > 0) matches.push({ score, result: createOperation(method, path, operation, spec) });
    }
  }

  return matches.sort((a, b) => b.score - a.score || a.result.path.localeCompare(b.result.path))
    .slice(0, limit)
    .map(match => match.result);
}

module.exports = { OPENAPI_URL, loadOpenApi, searchOperations };