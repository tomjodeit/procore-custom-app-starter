# Procore Sandbox Workshop

A reusable quick start for creating a Procore custom app, connecting it to a Developer Sandbox, and verifying access to company and project data. The app uses an authorization-code flow, keeps credentials and access tokens on the server, and performs read-only API checks.

## Procore setup

Use the Developer Portal recording alongside these steps:

1. Create a custom app and use its **Sandbox OAuth Credentials**.
2. Set the Sandbox redirect URI to `urn:ietf:wg:oauth:2.0:oob` for this workshop flow.
3. Install the app in the Developer Sandbox company using its Sandbox App Version Key.
4. Add the Sandbox Client ID and secret to a local `.env` file. Never commit or share `.env`.

## Run the workshop

```sh
npm install
npm start
```

Open `http://localhost:3001` (or the forwarded Codespaces URL). Select **Connect to Sandbox**; Procore opens in a new tab so the workshop dashboard stays available. Sign in and authorize, copy the displayed code, return to the dashboard tab, select **Continue to code entry**, and submit it inline. The dashboard will load companies; choose one to fetch its projects. The success panel appears after a successful Sandbox API read.

Start from `.env.example` when sharing this package. Set `SESSION_SECRET` to a fresh random value for each hosted instance. The app currently uses in-memory sessions for workshop development; restarting the server clears connected sessions.

## Continue on your computer

Before sharing, grant the intended audience access to the starter repository and enable **Template repository** in its GitHub settings. Participants use **Use this template** to create their own repository, then clone that new repository. They need Git and Node.js 18 or later installed locally.

macOS or Linux:

```sh
git clone https://github.com/your-org/procore-workshop-template.git my-procore-app
cd my-procore-app
cp .env.example .env
npm install
```

Windows PowerShell:

```powershell
git clone https://github.com/your-org/procore-workshop-template.git my-procore-app
Set-Location my-procore-app
Copy-Item .env.example .env
npm install
```

In either case, add the app's Sandbox Client ID and secret to `.env`, then start the local server with `npm start`. The Codespaces OAuth callback is not used locally; the out-of-band Sandbox flow works in the local browser.

## API calls exercised

- `GET https://sandbox.procore.com/rest/v1.0/companies`
- `GET https://sandbox.procore.com/rest/v1.1/projects?company_id=...` with `Procore-Company-Id`

The workshop is read-only and does not create Procore records. The API catalog searches Procore's live OpenAPI document and surfaces request fields and operation cautions. For example, search `create projects batch` to find `PATCH /rest/v1.0/projects/sync`; its reference warns against bulk project creation due to performance bottlenecks.

## Explore APIs with Copilot

This repository includes `.github/copilot-instructions.md`, which directs Copilot to consult the official Procore OAS before proposing endpoints or payloads. The same contract can be searched from the dashboard or terminal:

```sh
npm run api:search -- "projects create batch"
npm run api:download
grep -n '"/rest/v1.0/projects/sync"' tmp/procore-openapi.json
```

Use the dashboard's **Copy Copilot context** action to include a selected operation's method, path, body fields, cautions, and reference link in a planning prompt. The catalog is discovery-only: it never runs an operation. Keep automation design, validation, and any Sandbox writes as explicit next steps.

The workshop is read-only and does not create Procore records. Add a separate, explicit Sandbox write exercise only after choosing the record type and confirming the required app permissions.
