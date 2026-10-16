# Procore Custom App Starter

[![Use this template](https://img.shields.io/badge/Use_this_template-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/tomjodeit/procore-custom-app-starter/generate)

A quick start for creating a Procore custom app, connecting it to a Developer Sandbox, and verifying access to company and project data. The app uses an authorization-code flow, keeps credentials and access tokens on the server, and performs read-only API checks.

The recommended path is **GitHub Codespaces**: nothing to install, the same environment for everyone, and GitHub Copilot is built in.

## 1. Create your Procore custom app

Use the Developer Portal recording alongside these steps:

1. Create a custom app and use its **Sandbox OAuth Credentials**.
2. Set the Sandbox redirect URI to `urn:ietf:wg:oauth:2.0:oob` for this workshop flow.
3. Install the app in the Developer Sandbox company using its Sandbox App Version Key.
4. Keep the Sandbox Client ID and Client Secret handy for the next step.

## 2. Open in Codespaces

1. Click **Use this template → Create a new repository** above to make your own copy (public or private). Use your copy for everything below, not this repository, so you can commit and push your changes.
2. Add your credentials as **Codespaces secrets** so they survive if the Codespace is ever deleted and never end up in a commit. In GitHub go to **Settings → Codespaces → Secrets → New secret**, grant access to your repository, and add these two:

   | Secret | Value |
   | --- | --- |
   | `PROCORE_CLIENT_ID` | Sandbox Client ID |
   | `PROCORE_CLIENT_SECRET` | Sandbox Client Secret |

   Add secrets before creating the Codespace. The create page also prompts for these two values, so you can enter them there instead. If you add them afterward, rebuild the Codespace (**Command Palette → Codespaces: Rebuild Container**).
3. In your copy, select **Code → Codespaces → Create codespace on main**.
4. The container installs dependencies and creates a `.env` from `.env.example` automatically. Secrets take precedence over `.env`, so you do not need to edit it. Never commit or share `.env`.
5. In the terminal:

   ```sh
   npm start
   ```

6. The forwarded port opens a preview. Select **Connect to Sandbox**; Procore opens in a separate popup window, while the inline code field opens automatically in the dashboard. Sign in and authorize, copy the displayed code, return focus to the dashboard, paste the code, and submit. The dashboard loads companies; choose one to fetch its projects. The success panel appears after a successful Sandbox API read.

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

The workshop app runs in a Codespace or on localhost only. When you are ready to share an app:

- **GitHub Pages** is the natural first stop since your code is already on GitHub. Pages is free, but only for **public** repositories on a free account, so your site and source would be public. Pages serves static files only, so it can host a front end but cannot run this Express server. The server holds your Client Secret and token exchange, so keep it on a separate host (for example Azure, Render, or Fly.io) and never put the secret in front-end code.
- Before going live, switch from the out-of-band redirect to a real HTTPS redirect URI registered in the Developer Portal (`PROCORE_OAUTH_MODE` and `PROCORE_REDIRECT_URI`), set a fresh `SESSION_SECRET`, and replace the in-memory session store with a persistent one.

## Stretch: react to changes with webhooks

Webhooks let Procore tell your app when something changes (for example a project is created) instead of your app polling the API. This is optional and not wired into the starter, because it has setup costs that the read-only workshop avoids. Read the [How Webhooks Work](https://developers.procore.com/documentation/webhooks) and [Set Up Webhooks](https://developers.procore.com/documentation/webhooks-api) guides first, then ask Copilot to build a small listener.

What to know before you start:

- **Your endpoint must be public HTTPS.** In a Codespace, forwarded ports are private by default, so Procore's request would hit a GitHub sign-in page. Making port 3001 **Public** exposes the whole app to anyone with the URL, including the connect and create routes. If you try it, keep the listener on its own route, require a secret header (below), and set the port back to Private when you are done. Local `localhost` will not work without a tunnel.
- **Permission.** In the Developer Portal, set the app's **Webhooks API** permission to **Standard** (the default is None), then reinstall or update the Sandbox app version so it takes effect.
- **Create a hook, then triggers.** `POST /rest/v1.0/webhooks/hooks` with your `destination_url`, a lowercase-and-dashes `namespace`, an `api_version` (use `v4.0` for new work), and `destination_headers` such as `{ "Authorization": "Bearer <your-secret>" }`. Then add triggers with `POST /rest/v1.0/webhooks/hooks/{hook_id}/triggers` (`resource_name` plus `event_type` of `create`, `update`, or `delete`). A hook with no triggers sends nothing. Use either `company_id` or `project_id` per request, and send the `Procore-Company-Id` header like any other call.
- **Verify every request.** Procore sends the headers you configured, so reject any request whose `Authorization` header does not match your secret. Keep that secret in a Codespaces secret, not in code.
- **Respond fast, work later.** Return `200` or `204` immediately. Procore times out after 5 seconds, retries with backoff, and discards queued events after 12 hours of continuous failure.
- **A webhook is a notification, not the data.** The payload has IDs (`resource_id`, `project_id`, `company_id`), so fetch the record with a normal API call afterward. The starter keeps tokens in a browser session, so a listener has no token to call back with until you add server-side token storage.
- **Expect duplicates and gaps.** Deduplicate on the event `ulid` (or `id`), and run an occasional API sync to catch anything missed.
- **Clean up.** Hooks live in the Sandbox company after your Codespace is gone. Delete test hooks, and note that a stopped Codespace (it sleeps after 30 minutes idle) will fail deliveries.

Check deliveries with `GET /rest/v1.0/webhooks/hooks/{hook_id}/deliveries?company_id=...&filter[status]=failing`.

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

Add a separate, explicit Sandbox write exercise only after choosing the record type and confirming the required app permissions.
