# Procore API Research

- Treat the current Procore OpenAPI document as the source of truth: `https://developers.procore.com/api/v1/resource_groups/full_oas`.
- Search before proposing an endpoint or payload. Use `npm run api:search -- "projects create batch"` for a concise operation summary, parameters, request-body fields, and cautions.
- For direct inspection, use `npm run api:download` and search `tmp/procore-openapi.json` with `grep` or another local text search tool. The downloaded specification is generated and must not be committed.
- Verify the exact HTTP method, API version, required query/header values, request schema, response, and operation warnings. Do not infer a write contract from a read endpoint.
- Keep examples on the Procore Sandbox. Never send a mutating request or create/update records unless the user explicitly asks and confirms the intended test data.
- For project imports, inspect `PATCH /rest/v1.0/projects/sync` and its current documentation. It supports batch create/update, but Procore warns against using it for bulk project creation because of performance bottlenecks. Discuss safer alternatives and validation before designing an Excel automation.
- Never print, copy into prompts, or commit `.env`, client secrets, access tokens, refresh tokens, or authorization codes.

# Procore API Rules of the Road

Read these before writing any code that calls Procore. They come from the official docs: [FAQ](https://developers.procore.com/documentation/faq), [Handling Procore Regions](https://developers.procore.com/documentation/tutorial-mpz), [Rate Limiting](https://developers.procore.com/documentation/rate-limiting), [Pagination](https://developers.procore.com/documentation/pagination), [Configurable Fieldsets](https://developers.procore.com/documentation/tutorial-config-fieldsets), [Attachments](https://developers.procore.com/documentation/attachments), and [Documents](https://developers.procore.com/documentation/tutorial-documents).

## Always call Procore through `procoreRequest` in `server.js`

- Do not write a new raw `fetch` to Procore. `procoreRequest(req, endpoint, { companyId, method, body })` adds the bearer token, the `Procore-Company-Id` header, and JSON handling, and returns `status`, `data`, `pagination`, and `rateLimit`.
- Writes use the same helper, for example `procoreRequest(req, '/rest/v1.0/projects', { companyId, method: 'POST', body: { company_id: Number(companyId), project: { name } } })`.
- Keep tokens and secrets on the server. The browser only talks to this app's own `/api/...` routes.

## `Procore-Company-Id` header

- Every Procore API call must send the `Procore-Company-Id` request header with the company's ID. The only exceptions are `GET /rest/v1.0/me` and `GET /rest/v1.0/companies`. This applies to the Sandbox too.
- Missing it fails with `Missing Procore-Company-Id header!`.
- It does not replace `company_id`. If an endpoint also takes `company_id` in the path, query, or body, send both.
- Get company IDs from `GET /rest/v1.0/companies`. Store IDs as 64-bit-safe values; they can exceed 32 bits.

## Authentication and tokens

- Sandbox hosts are `https://login-sandbox.procore.com` (OAuth) and `https://sandbox.procore.com` (API), set in `.env`. Production uses `login.procore.com` and `api.procore.com`.
- Access tokens last 90 minutes. Refresh tokens are one-time use: any refresh call, even a failed one, invalidates the old refresh token. Always store the new pair. This app keeps tokens in memory, so a server restart means connecting again.
- `403 App is not connected to this company` means the app was disconnected in the company's App Management page.

## Rate limiting

- Limits are hourly (60 minutes) and spike (10 seconds). Every request counts, including `400`, `403`, and `404` responses, so fix malformed calls instead of retrying them.
- Read `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, and `X-Rate-Limit-Reset` (Unix seconds) from each response (`result.rateLimit`). Do not hardcode limits.
- On `429`, stop and wait until `X-Rate-Limit-Reset`, then retry with backoff and jitter. On `503`, wait the number of seconds in `Retry-After`.
- Fetch collections with one index call instead of one call per record. Avoid recursive crawls (for example every folder in Documents) and tight polling loops. Throttle bulk work with a small queue or concurrency limit.

## Pagination

- Many list endpoints accept `per_page` and `page` (1-based). Keep `per_page` at or below 2,000. Not every endpoint paginates, so check its reference.
- Responses include `Link` (first, prev, next, last), `Total`, and `Per-Page` headers (`result.pagination`). Follow `rel="next"` until it is absent instead of guessing page counts.

## Configurable fieldsets and custom fields

- Companies can mark fields on a tool as required, optional, or hidden. When any field is required, create and update requests must include `"run_configurable_validations": true` in the JSON body, plus a value for each required field. The error tells you which fields are missing.
- When updating a record, include a required field if its current value is null.
- Custom fields are sent as `custom_field_{id}` in the body (for example `custom_field_49417`); read the IDs from the `custom_fields` object on an existing record. Multi-select values must be arrays, even for one value.
- Coordination Issues, Meetings, Schedule, Action Plans, Forms, Budget, Change Orders, and Direct Costs do not support configurable fieldsets.

## Attachments and files

- Use the uploads-first flow from [Direct File Uploads](https://developers.procore.com/documentation/tutorial-uploads): create an upload (`POST /rest/v1.1/projects/{project_id}/uploads` or the `companies/{company_id}` equivalent), upload the file to the returned storage `url`, then reference the returned `uuid` on the target record (for example `upload_ids` on accident logs, or `upload.uuid` on images). Check the endpoint reference, because the field name varies by tool.
- Never send the Procore access token to the storage URL; it is a different service and rejects it.
- Segmented uploads need `PATCH .../uploads/{uuid}` with the eTags in segment order to finish. Segments are 5 MB to 5 GB, except the last.
- Some endpoints still accept `multipart/form-data`. Prefer the uploads-first flow and confirm in the endpoint reference.

## Safety defaults for this workshop

- Preview first. Show the exact request that would be sent and wait for the user to confirm before any POST, PUT, PATCH, or DELETE.
- Test writes with one record, check the result in Procore, then scale up.
- Prefer a single-record create (for example `POST /rest/v1.0/projects`) over `PATCH /rest/v1.0/projects/sync` for projects, as noted above.
