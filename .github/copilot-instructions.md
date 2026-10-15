# Procore API Research

- Treat the current Procore OpenAPI document as the source of truth: `https://developers.procore.com/api/v1/resource_groups/full_oas`.
- Search before proposing an endpoint or payload. Use `npm run api:search -- "projects create batch"` for a concise operation summary, parameters, request-body fields, and cautions.
- For direct inspection, use `npm run api:download` and search `tmp/procore-openapi.json` with `grep` or another local text search tool. The downloaded specification is generated and must not be committed.
- Verify the exact HTTP method, API version, required query/header values, request schema, response, and operation warnings. Do not infer a write contract from a read endpoint.
- Keep examples on the Procore Sandbox. Never send a mutating request or create/update records unless the user explicitly asks and confirms the intended test data.
- For project imports, inspect `PATCH /rest/v1.0/projects/sync` and its current documentation. It supports batch create/update, but Procore warns against using it for bulk project creation because of performance bottlenecks. Discuss safer alternatives and validation before designing an Excel automation.
- Never print, copy into prompts, or commit `.env`, client secrets, access tokens, refresh tokens, or authorization codes.