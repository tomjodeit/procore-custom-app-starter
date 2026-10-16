# Procore Custom App Starter

A quick start for creating a Procore custom app, connecting it to a Developer Sandbox, and verifying access to company and project data. The app uses an authorization-code flow, keeps credentials and access tokens on the server, and starts with two safe read-only checks so your first run cannot change anything. From there it is a foundation to build on: create records, upload files, react to webhooks, or connect another system.

The recommended path is **GitHub Codespaces**: nothing to install, the same environment for everyone, and GitHub Copilot is built in.

## 1. Make your own copy

[![Use this template](https://img.shields.io/badge/Use_this_template-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/tomjodeit/procore-custom-app-starter/generate)

Click the button above, then **Create a new repository**, pick yourself as the owner, and choose public or private. You get an independent copy in your own GitHub account, with no link back to this repository, so you can commit and push freely. Use your copy for everything that follows.

A fork also works if you want to pull in future updates from this repository, but a fork of a public repository must stay public, so the template is the better choice if you will build something for your company.

## 2. Create your Procore custom app

Use the Developer Portal recording alongside these steps:

1. Create a custom app and use its **Sandbox OAuth Credentials**.
2. Set the Sandbox redirect URI to `urn:ietf:wg:oauth:2.0:oob` for this workshop flow.
3. Install the app in the Developer Sandbox company using its Sandbox App Version Key.
4. Keep the Sandbox Client ID and Client Secret handy for the next step.

## 3. Open in Codespaces

1. Click the button below and, under **Repository**, choose your copy (not `tomjodeit/procore-custom-app-starter`). Under **Recommended secrets**, paste your Sandbox Client ID and Client Secret from step 2. GitHub saves them as your own Codespaces secrets, so they persist if the Codespace is ever deleted and never end up in a commit. Then select **Create codespace**.

   [![Create a codespace](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new)

   | Secret | Value |
   | --- | --- |
   | `PROCORE_CLIENT_ID` | Sandbox Client ID |
   | `PROCORE_CLIENT_SECRET` | Sandbox Client Secret |

   A Codespace is billed to the person who creates it, so it uses your own free monthly allowance (120 core-hours on GitHub Free), never the account that owns the template. It stops itself after 30 minutes idle.

   <details>
   <summary>Started a Codespace another way, or need to change the secrets?</summary>

   **Don't see the Recommended secrets boxes?** GitHub only asks for secrets you have not created before. If you have `PROCORE_CLIENT_ID` or `PROCORE_CLIENT_SECRET` from an earlier project, open **Settings → Codespaces → Secrets**, edit each one, and make sure your new repository is listed under **Repository access**, then rebuild the Codespace.

   **Secrets not loading?** When they are missing, the terminal prints a `WARNING` when you run `npm start`, and **Connect to Sandbox** explains the problem instead of sending you to Procore with placeholder values.

   The quick **Code → Codespaces → Create codespace on main** button in your copy does not show the secrets prompt. Either use **Code → Codespaces → ⋯ → New with options** to get the same page as the button above, or add the two secrets in GitHub under **Settings → Codespaces → Secrets → New secret** (grant access to your copy). Secrets added after a Codespace exists are not loaded until you rebuild it: **Command Palette → Codespaces: Rebuild Container**.
   </details>
2. The container installs dependencies and creates a `.env` from `.env.example` automatically. Secrets take precedence over `.env`, so you do not need to edit it. Never commit or share `.env`.
3. In the terminal:

   ```sh
   npm start
   ```

   The terminal prints the URL to open. You can also Cmd/Ctrl-click the `localhost:3001` link.

4. `npm start` opens the app in a new browser tab. The first time, your browser or the editor may ask whether to open the external website; choose **Open**. (If nothing opens, use the URL printed in the terminal, or go to the **Ports** tab and click the globe icon next to port 3001.) Select **Connect to Sandbox**; Procore opens in a separate popup window, while the inline code field opens automatically in the dashboard. Sign in and authorize, copy the displayed code, return focus to the dashboard, paste the code, and submit. When it works you will see a green **You're connected to Procore Sandbox** banner. Choose a company to read its projects (optional), then pick an idea under **What will you build?** and select **Copy Copilot kickoff**. Paste it into Copilot Chat in your Codespace to start building. If something goes wrong, open **Having trouble connecting?** on the left for the common fixes.

The app uses in-memory sessions for workshop development; restarting the server clears connected sessions, so just click **Connect to Sandbox** again.

## Coming back later

You do not need to create a new Codespace each time. Reopen the same one from [github.com/codespaces](https://github.com/codespaces); your files, terminal history, and installed packages are still there.

- A Codespace stops itself after 30 minutes idle. Stopped Codespaces cost nothing in compute, and personal accounts include a monthly free allowance of core-hours and storage.
- Inactive Codespaces are deleted after 30 days by default. **Commit and push your work** to keep it, because anything uncommitted is lost with the Codespace.
- Run `npm start` again after reopening. The app does not start on its own.

## Prefer your own machine?

First commit and push your changes from the Codespace (Source Control → **Commit**, then **Sync Changes**). The dashboard's success panel then unlocks a **Copy local setup prompt** button.

Paste that prompt into an AI coding assistant running in an empty folder on your computer. Any assistant that can run terminal commands works, for example Copilot Chat (agent mode) in VS Code, or [Claude Code](https://claude.com/claude-code) if you have access. It will clone the repo, install dependencies, create the `.env`, and start the server. You still add your Sandbox Client ID and secret to the local `.env` yourself. You need Git and Node.js 18 or later on that machine. The out-of-band Sandbox flow works the same in a local browser at `http://localhost:3001`.

No assistant available? Do it manually:

```sh
git clone https://github.com/YOUR-USER/YOUR-REPO.git my-procore-app
cd my-procore-app
cp .env.example .env   # then add your Client ID and secret
npm install
npm start
```

Another option that avoids installing anything: open the Codespace from your desktop VS Code with the **GitHub Codespaces** extension. You get a local editor attached to the same Codespace.

## What's next: hosting

The workshop app runs in a Codespace or on localhost only. When you are ready to share an app, the server (which holds your Client Secret and does the token exchange) needs a real host, and the secret must never go into front-end code.

**GitHub Pages is not the place for the server.** It serves static files only, so it can host a front end but cannot run this Express app. It is also free only for **public** repositories on a free account, so the site and source would be public.

Hosts that fit this app:

| Host | Good for | Notes |
| --- | --- | --- |
| **Azure** (App Service or Container Apps) | Microsoft-centric teams and enterprise clients | Runs the app as-is. Entra ID for sign-in, Key Vault for the Procore secret, and your organization's usual procurement and compliance. A sensible default for most Procore customers. |
| **Render** | The fastest way to get this exact app online | Connect your GitHub repo, set environment variables, deploy. No code changes. Free instances sleep when idle, which breaks webhook delivery, so use a paid instance for anything real. |
| **Vercel** | Teams that already use it and like its GitHub workflow (a preview deploy for every pull request) | Express runs there, but as time-limited serverless functions, not an always-on server (see [Fluid compute](https://vercel.com/docs/fluid-compute)). Sessions and webhook events must move out of memory into an external store, and the webhook listener becomes a route on the same app instead of its own port. Check Vercel's plan terms for commercial use. |

Before going live, on any host:

- Switch from the out-of-band redirect to a real HTTPS redirect URI registered in the Developer Portal (`PROCORE_OAUTH_MODE` and `PROCORE_REDIRECT_URI`).
- Set a fixed, random `SESSION_SECRET`, and replace the in-memory session store with a persistent one (Redis, a database, or your host's session service). The starter loses all sessions on restart, and serverless hosts can restart it between requests.
- Put your Procore Client ID and secret in the host's secret store, not in the repository.
- If you use webhooks, store events in a database and process them off the request, as described in the webhook bonus.

## Bonus: let Procore tell your app about changes (webhooks)

The main exercise has your app write to Procore. This bonus flips it: your app listens while you change things in Procore, and the dashboard shows each event as it happens. It needs no create permission and no spreadsheet, which makes it a low-friction alternative to creating projects from a list. Background reading: [How Webhooks Work](https://developers.procore.com/documentation/webhooks) and [Set Up Webhooks](https://developers.procore.com/documentation/webhooks-api).

**What the starter gives you.** An optional listener that runs only when `WEBHOOK_SECRET` is set. It runs on its own port (3002) so that port can be public while the dashboard on 3001 stays private. It accepts only `POST /webhooks/procore`, checks the shared secret, validates the v4.0 payload, ignores duplicate events, replies `204` immediately, and keeps the last 50 events in memory for the dashboard's "Live events" panel, which can also create and delete the Sandbox hook for you. Run its tests with `npm test`.

### 1. Turn the listener on

1. Add a Codespaces secret named `WEBHOOK_SECRET` set to a long random string (`openssl rand -hex 32`), then rebuild or restart the Codespace so it is loaded. Locally, put it in `.env`.
2. Run `npm start`. The log prints the listener URL, for example `https://<codespace-name>-3002.app.github.dev/webhooks/procore`.
3. Make only the listener port public, so Procore can reach it:

   ```sh
   gh codespace ports visibility 3002:public -c $CODESPACE_NAME
   ```

   Do not make port 3001 public. Public ports are reachable by anyone with the URL, so the secret header is what protects 3002. If the Codespace restarts, check that port 3002 is still Public.

### 2. Create the webhook from the dashboard

Connect to the Sandbox, choose a company, and the "Live events" panel appears (only when `WEBHOOK_SECRET` is set). Pick a project, read the request preview (the secret is hidden), tick the confirmation box, and select **Create webhook**. The app then makes two calls: it creates the hook pointing at your listener URL, and adds the triggers in the table below. It sends nothing until you confirm, and **Delete webhook** removes the hook it created, so you can clean up the Sandbox from the same screen.

The app needs the **Webhooks API** permission set to **Standard** in the Developer Portal (the default is None), and port 3002 must be Public. If either is missing, the panel shows Procore's error plus a hint.

**Prefer to do it by hand?** Procore's web UI creates a hook with the same API calls, so you can use the project's Webhooks tool. The listener requires the secret header, so if the UI doesn't let you set one, send the calls yourself. Replace the placeholders with your own IDs and send the `Procore-Company-Id` header:

```
POST /rest/v2.0/companies/{company_id}/projects/{project_id}/webhooks/hooks
{
  "payload_version": "v4.0",
  "namespace": "procore-starter",
  "destination_url": "https://<your-3002-url>/webhooks/procore",
  "destination_headers": { "Authorization": "Bearer <your WEBHOOK_SECRET>" }
}

POST /rest/v2.0/companies/{company_id}/projects/{project_id}/webhooks/hooks/{hook_id}/triggers/bulk
[
  { "resource_name": "Project Dates", "event_type": "update" },
  { "resource_name": "Project Files", "event_type": "create" }
]
```

The hook response wraps the hook in `data` and returns its `id` as a string. `namespace` accepts lowercase letters, digits, and dashes. Company-level hooks use the same paths without `/projects/{project_id}`.

### 3. Pick easy triggers

These need no setup beyond a sandbox project, and each is a click away in the Procore UI:

| Do this in Procore | Trigger (`resource_name`) |
| --- | --- |
| Edit the project's start or completion dates | `Project Dates` (`update`) |
| Change project settings | `Project Configuration` (`update`) |
| Upload a file in Documents | `Project Files` (`create`), `Project File Versions` (`create`) |
| Create, rename, or delete a folder | `Project Folders` (`create`, `update`, `delete`) |

Make the change, and within a few seconds a row appears in "Live events". The dashboard registers all of these triggers for the project. Keep triggers to what you need in your own apps: each one adds noise, and an `update` trigger fires on any edit.

### Good to know

- **A webhook is a notification, not the data.** A v4.0 event carries IDs and names (`id`, `reason`, `company_id`, `project_id`, `resource_type`, `resource_id`), so fetch the full record with a normal API call. This starter doesn't do that, because a listener has no user session to borrow a token from. Production apps use a service account or stored, encrypted tokens.
- **Procore expects a fast reply.** It waits 5 seconds, retries with backoff when delivery fails, and discards queued events after 12 hours of continuous failure. Deliveries can repeat, so dedupe on the event `id`. Run an occasional API sync to catch anything missed.
- **A stopped Codespace can't receive events** (it sleeps after 30 minutes idle), and hooks stay in the Sandbox afterward. Delete test hooks when you're done.
- **What a production listener adds:** its own hosted service with managed HTTPS, secrets in a secret manager and rotated, a queue and database instead of memory, size and rate limits, ignoring events caused by your own app (see the event metadata), and monitoring of the deliveries endpoint.
- **No public port?** A hosted test bin such as Webhook Relay's free webhook tester gives you a public URL that just shows what Procore sends. Bins are public and expire after about 48 hours, so use sandbox data only.

## API calls exercised

- `GET https://sandbox.procore.com/rest/v1.0/companies`
- `GET https://sandbox.procore.com/rest/v1.1/projects?company_id=...` with `Procore-Company-Id`

These two checks are read-only, so the first run proves your connection without changing anything in Procore. They are a starting point, not a limit. Ask Copilot to extend the app (the repository's Copilot instructions cover the headers, pagination, rate limits, fieldsets, and uploads), and see the webhook bonus below for an example that writes to the Sandbox.

The **API lookup** button (top right of the dashboard) opens a side panel that searches Procore's live OpenAPI document and shows request fields and operation cautions. For example, search `create projects batch` to find `PATCH /rest/v1.0/projects/sync`; its reference warns against bulk project creation due to performance bottlenecks. Writes need the matching permissions on your app in the Developer Portal. Keep them on the Sandbox, preview the exact request first, and test with one record before scaling up.

## Explore APIs with Copilot

This repository includes `.github/copilot-instructions.md`, which directs Copilot to consult the official Procore OAS before proposing endpoints or payloads. The same contract can be searched from the dashboard or terminal:

```sh
npm run api:search -- "projects create batch"
npm run api:download
grep -n '"/rest/v1.0/projects/sync"' tmp/procore-openapi.json
```

Use the dashboard's **Copy Copilot context** action to include a selected operation's method, path, body fields, cautions, and reference link in a planning prompt. The catalog is discovery-only: it never runs an operation. Keep automation design, validation, and any Sandbox writes as explicit next steps.

When you are ready to write to the Sandbox, choose the record type, confirm the app has the required permissions, and have Copilot show the exact request before anything is sent.
