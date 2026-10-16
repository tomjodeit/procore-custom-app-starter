const statusPill = document.querySelector('#connection-status');
const connectButton = document.querySelector('#connect-button');
const oauthInstructions = document.querySelector('#oauth-instructions');
const connectedDetails = document.querySelector('#connected-details');
const codeEntryForm = document.querySelector('#code-entry-form');
const codeEntryFeedback = document.querySelector('#code-entry-feedback');
const codeEntryStatus = document.querySelector('#code-entry-status');
const codeEntryRetry = document.querySelector('#code-entry-retry');
const companySelect = document.querySelector('#company-select');
const projectList = document.querySelector('#project-list');
const projectCount = document.querySelector('#project-count');
const successPanel = document.querySelector('#success-panel');
const successCopy = document.querySelector('#success-copy');
const buildGoalInput = document.querySelector('#build-goal');
const copyCopilotPromptButton = document.querySelector('#copy-copilot-prompt');
const copilotCopyStatus = document.querySelector('#copilot-copy-status');
const repositoryLink = document.querySelector('#repository-link');
const repositoryName = document.querySelector('#repository-name');
const repositoryStatus = document.querySelector('#repository-status');
const refreshRepositoryStatusButton = document.querySelector('#refresh-repository-status');
const localPromptOutput = document.querySelector('#local-prompt-output');
const copyLocalPromptButton = document.querySelector('#copy-local-prompt');
const localCopyStatus = document.querySelector('#local-copy-status');
const catalogSearchForm = document.querySelector('#catalog-search-form');
const catalogQuery = document.querySelector('#catalog-query');
const catalogStatus = document.querySelector('#catalog-status');
const catalogResults = document.querySelector('#catalog-results');
const steps = [...document.querySelectorAll('.progress-step')];
const webhookPanel = document.querySelector('#webhook-panel');
const webhookUrl = document.querySelector('#webhook-url');
const webhookEvents = document.querySelector('#webhook-events');
const webhookEmpty = document.querySelector('#webhook-empty');
const webhookProject = document.querySelector('#webhook-project');
const webhookPreview = document.querySelector('#webhook-preview');
const webhookConfirm = document.querySelector('#webhook-confirm');
const webhookCreate = document.querySelector('#webhook-create');
const webhookDelete = document.querySelector('#webhook-delete');
const webhookStatus = document.querySelector('#webhook-status');
const connectedBanner = document.querySelector('#connected-banner');
const confettiBox = document.querySelector('#confetti');
const credentialWarning = document.querySelector('#credential-warning');
const troubleDetails = document.querySelector('#trouble');
const dataHelp = document.querySelector('#data-help');
const ideaChips = document.querySelector('#idea-chips');
const catalogDrawer = document.querySelector('#catalog-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const catalogOpenButtons = [document.querySelector('#catalog-open'), document.querySelector('#catalog-open-inline')];
const catalogClose = document.querySelector('#catalog-close');
let loadedProjects = [];
let currentHook = null;
let repositoryContext = null;

function openCodeEntry() {
  codeEntryFeedback.hidden = true;
  codeEntryForm.hidden = false;
  codeEntryForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  codeEntryForm.querySelector('input').focus({ preventScroll: true });
}

function openAuthorizationPopup() {
  const popup = window.open(
    connectButton.href,
    'procore-sandbox-authorization',
    'popup=yes,width=1000,height=760,resizable=yes,scrollbars=yes'
  );
  if (!popup) return false;

  popup.opener = null;
  window.focus();
  return true;
}

function launchAuthorization(event) {
  event.preventDefault();
  openCodeEntry();
  oauthInstructions.hidden = false;
  oauthInstructions.textContent = 'Procore is opening in a separate window. Approve access, then paste the code in the ready field below.';

  if (!openAuthorizationPopup()) {
    oauthInstructions.textContent = 'Your browser blocked the authorization window. Allow pop-ups for this site, then select Connect to Sandbox again.';
  }
}

connectButton.addEventListener('click', launchAuthorization);
codeEntryRetry.addEventListener('click', launchAuthorization);

if (location.hash === '#code-entry') openCodeEntry();

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detailFields = ['message', 'reason', 'fields', 'error'];
    const details = detailFields
      .map(field => [field, body[field]])
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([field, value]) => `${field}: ${value.slice(0, 400)}`);
    const code = body.code;
    const requestId = body.request_id || body.requestId;
    const diagnostic = {
      status: response.status,
      code,
      requestId,
      ...Object.fromEntries(details.map(detail => {
        const separator = detail.indexOf(': ');
        return [detail.slice(0, separator), detail.slice(separator + 2)];
      }))
    };
    console.error(`API request failed: ${new URL(url, location.origin).pathname}`, diagnostic);
    const failure = new Error(details.join(' | ') || `Request failed (${response.status}).`);
    failure.status = response.status;
    throw failure;
  }
  return body;
}

function setStep(stepName) {
  const stepOrder = ['connect', 'explore', 'verify'];
  const currentIndex = stepOrder.indexOf(stepName);
  steps.forEach((step, index) => {
    step.classList.toggle('is-current', index === currentIndex);
    step.classList.toggle('is-done', index < currentIndex);
  });
}

async function activateConnectedSession(justConnected = false) {
  statusPill.classList.add('is-connected');
  statusPill.lastChild.textContent = ' Connected';
  connectedDetails.hidden = false;
  connectButton.hidden = true;
  oauthInstructions.hidden = true;
  codeEntryForm.hidden = true;
  codeEntryFeedback.hidden = true;
  setStep('explore');
  credentialWarning.hidden = true;
  successPanel.hidden = false;
  showConnectedBanner(justConnected);
  successCopy.textContent = 'Choose a company above to read its projects, or jump straight to an idea below.';
  await loadRepositoryHandoff();
  loadWebhookEvents();
  await loadCompanies();
}

function showError(target, message) {
  target.replaceChildren();
  const error = document.createElement('p');
  error.className = 'empty-state error-state';
  error.textContent = message;
  target.append(error);
}

function createCopilotKickoff() {
  const goal = buildGoalInput.value.trim() || 'a Procore workflow of my choice';
  return [
    'Continue building this Procore custom app in the current repository.',
    `My goal: ${goal}`,
    'Before choosing endpoints or payloads, consult the current Procore OpenAPI specification at https://developers.procore.com/api/v1/resource_groups/full_oas. Use `npm run api:search -- "<resource and action>"` and verify the exact method, version, required fields, and cautions.',
    'First propose an implementation plan with input mapping, validation, duplicate handling, and a dry-run or preview step. Keep credentials server-side.',
    'Do not send mutating API requests or create/update Sandbox records until I review and explicitly confirm the test data.',
    'Follow the repository Copilot instructions: send Procore-Company-Id on every call, use the procoreRequest helper in server.js, and mind pagination, rate limits, and configurable fieldsets. If the goal creates projects, prefer a single POST /rest/v1.0/projects over the bulk sync endpoint.'
  ].join('\n\n');
}

function getLocalPrompt() {
  if (!repositoryContext?.repositoryUrl || repositoryContext.hasUncommittedChanges || !repositoryContext.hasUpstream || repositoryContext.ahead > 0 || repositoryContext.behind > 0) {
    return null;
  }
  return [
    `Clone ${repositoryContext.repositoryUrl} into a new folder, set it up to run locally, and pick up where I left off in my Codespace.`,
    'Copy .env.example to .env, install dependencies with npm install, and tell me which values I still need to add (my Procore Sandbox Client ID and secret). Do not ask me to paste the secret into chat.',
    'Then start the app with npm start and confirm it loads at http://localhost:3001. I need Git and Node.js 18 or later; help me install them if they are missing.'
  ].join('\n\n');
}

function updateLocalPrompt() {
  const prompt = getLocalPrompt();
  copyLocalPromptButton.disabled = !prompt;
  if (prompt) {
    localPromptOutput.textContent = prompt;
  } else if (!repositoryContext) {
    localPromptOutput.textContent = 'Checking this Codespace’s Git status...';
  } else if (!repositoryContext.repositoryUrl) {
    localPromptOutput.textContent = 'No GitHub origin found. Open this Codespace from your GitHub repository.';
  } else {
    localPromptOutput.textContent = 'Commit and push your Codespace changes from Source Control first. Then refresh repository status.';
  }
}

async function loadRepositoryHandoff() {
  setRepositoryStatus('Checking this Codespace’s repository status...', 'checking');
  refreshRepositoryStatusButton.disabled = true;
  try {
    repositoryContext = await getJson('/api/repository');
    if (repositoryContext.repositoryUrl) {
      repositoryLink.href = repositoryContext.repositoryUrl;
      repositoryName.textContent = new URL(repositoryContext.repositoryUrl).pathname.split('/').filter(Boolean).pop();
      repositoryLink.hidden = false;
    } else {
      repositoryLink.hidden = true;
    }

    if (repositoryContext.hasUncommittedChanges) {
      setRepositoryStatus('Uncommitted Codespace changes. In Source Control, commit them and select Sync Changes or Push. Refresh here afterward.', 'warning');
    } else if (!repositoryContext.hasUpstream || repositoryContext.ahead > 0) {
      setRepositoryStatus('Your latest commit is only in this Codespace. In Source Control, select Sync Changes or Push. Refresh here after it reaches GitHub.', 'warning');
    } else if (repositoryContext.behind > 0) {
      setRepositoryStatus('This Codespace is behind GitHub. In Source Control, pull or sync the latest changes, then refresh here.', 'warning');
    } else {
      setRepositoryStatus('This Codespace is committed and synced with GitHub. An AI assistant on your computer can pick up from here.', 'ready');
    }
    updateLocalPrompt();
  } catch (error) {
    repositoryContext = null;
    setRepositoryStatus(error.message, 'warning');
    updateLocalPrompt();
  } finally {
    refreshRepositoryStatusButton.disabled = false;
  }
}

function setRepositoryStatus(message, state) {
  repositoryStatus.textContent = message;
  repositoryStatus.classList.toggle('is-warning', state === 'warning');
  repositoryStatus.classList.toggle('is-ready', state === 'ready');
}

refreshRepositoryStatusButton.addEventListener('click', loadRepositoryHandoff);

copyCopilotPromptButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(createCopilotKickoff());
    copilotCopyStatus.textContent = 'Copied. Open Copilot Chat in this Codespace and paste to continue.';
  } catch {
    copilotCopyStatus.textContent = 'Clipboard unavailable. Select and copy the goal, then ask Copilot to consult the Procore OAS.';
  }
});

copyLocalPromptButton.addEventListener('click', async () => {
  const prompt = getLocalPrompt();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    localCopyStatus.textContent = 'Prompt copied. Paste it into an AI coding assistant on your computer.';
  } catch {
    localCopyStatus.textContent = 'Clipboard unavailable. Select and copy the prompt above.';
  }
});

function operationContext(operation) {
  const parameters = operation.parameters.map(parameter =>
    `- ${parameter.name} (${parameter.in}${parameter.required ? ', required' : ''})`
  ).join('\n');
  const bodyFields = operation.requestBody?.fields?.map(field =>
    `- ${field.name}: ${field.type}${field.required ? ' (required)' : ''}`
  ).join('\n') || 'No JSON request body is documented.';

  return [
    'Help me plan an integration using this Procore API operation. Do not execute API calls or create/update records; first explain the contract, validation, and risks.',
    `${operation.method.toUpperCase()} ${operation.path} - ${operation.summary}`,
    operation.description,
    parameters ? `Parameters:\n${parameters}` : '',
    `Request body:\n${bodyFields}`,
    `Official reference: ${operation.documentationUrl}`
  ].filter(Boolean).join('\n\n');
}

function cleanDescription(text = '') {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

const MAX_RESULTS = 8;

function renderCatalogResults(operations) {
  catalogResults.replaceChildren();
  if (operations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No matching operations. Try a resource name and action, such as "projects create".';
    catalogResults.append(empty);
    return;
  }

  operations.slice(0, MAX_RESULTS).forEach(operation => {
    const item = document.createElement('details');
    item.className = 'operation-result';

    const summary = document.createElement('summary');
    const titleRow = document.createElement('span');
    titleRow.className = 'operation-title-row';
    const method = document.createElement('span');
    method.className = `method-tag method-${operation.method}`;
    method.textContent = operation.method.toUpperCase();
    const heading = document.createElement('strong');
    heading.textContent = operation.summary;
    titleRow.append(method, heading);
    const path = document.createElement('code');
    path.className = 'operation-path';
    path.textContent = operation.path;
    summary.append(titleRow, path);
    item.append(summary);

    const body = document.createElement('div');
    body.className = 'operation-body';
    const description = document.createElement('p');
    description.className = 'operation-description';
    description.textContent = shorten(cleanDescription(operation.description), 280);
    body.append(description);

    const fields = operation.requestBody?.fields || [];
    if (fields.length) {
      const fieldList = document.createElement('p');
      fieldList.className = 'schema-fields';
      const shown = fields.slice(0, 10).map(field => `${field.name}${field.required ? '*' : ''}`);
      fieldList.textContent = `Body: ${shown.join(', ')}${fields.length > 10 ? `, and ${fields.length - 10} more` : ''}`;
      body.append(fieldList);
    }

    if (operation.caution) {
      const caution = document.createElement('p');
      caution.className = 'operation-caution';
      caution.textContent = shorten(cleanDescription(operation.caution), 200);
      body.append(caution);
    }

    const actions = document.createElement('div');
    actions.className = 'operation-actions';
    const docs = document.createElement('a');
    docs.href = operation.documentationUrl;
    docs.target = '_blank';
    docs.rel = 'noopener';
    docs.textContent = 'View documentation';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-context';
    copy.textContent = 'Copy Copilot context';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(operationContext(operation));
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Clipboard unavailable';
      }
    });
    actions.append(docs, copy);
    body.append(actions);
    item.append(body);
    catalogResults.append(item);
  });

  if (operations.length > MAX_RESULTS) {
    const more = document.createElement('p');
    more.className = 'catalog-status';
    more.textContent = `Showing the first ${MAX_RESULTS} of ${operations.length}. Add a word to narrow the search.`;
    catalogResults.append(more);
  }
}

catalogSearchForm.addEventListener('submit', async event => {
  event.preventDefault();
  const query = catalogQuery.value.trim();
  if (query.length < 2) return;

  catalogStatus.textContent = 'Searching the Procore OpenAPI reference...';
  catalogResults.replaceChildren();
  try {
    const result = await getJson(`/api/catalog/search?q=${encodeURIComponent(query)}`);
    renderCatalogResults(result.results);
    catalogStatus.textContent = `${result.results.length} matching operation${result.results.length === 1 ? '' : 's'} from the live Procore API reference. Open one for details.`;
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
});

async function loadProjects(companyId, companyName) {
  setStep('explore');
  dataHelp.hidden = true;
  projectCount.textContent = 'Loading';
  projectList.innerHTML = '<p class="empty-state">Loading Sandbox projects...</p>';

  try {
    const data = await getJson(`/api/projects?company_id=${encodeURIComponent(companyId)}`);
    const projects = Array.isArray(data) ? data : data.projects || [];
    loadedProjects = projects;
    fillWebhookProjects(companyId);
    projectCount.textContent = String(projects.length);
    projectList.replaceChildren();

    if (projects.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No projects are available for this company.';
      projectList.append(empty);
    } else {
      projects.slice(0, 12).forEach((project, index) => {
        const row = document.createElement('div');
        row.className = 'project-row';
        row.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
        const name = document.createElement('span');
        name.textContent = project.name || `Project ${project.id}`;
        const status = document.createElement('span');
        status.textContent = project.active === false ? 'Inactive' : 'Sandbox';
        row.append(name, status);
        projectList.append(row);
      });
    }

    successCopy.textContent = `Nice: your app read ${projects.length} project${projects.length === 1 ? '' : 's'} from ${companyName}. Now pick what to build.`;
    if (projects.length === 0) showDataHelp('This company has no projects yet, which is normal for a fresh Sandbox. Try an idea that creates one, or create a project in Procore and refresh.');
    setStep('verify');
  } catch (error) {
    projectCount.textContent = '--';
    showError(projectList, error.message);
    showDataHelp(helpFor(error));
  }
}

async function loadCompanies() {
  companySelect.disabled = true;
  companySelect.innerHTML = '<option value="">Loading companies...</option>';
  try {
    const data = await getJson('/api/companies');
    const companies = Array.isArray(data) ? data : data.companies || [];
    companySelect.replaceChildren(new Option('Select a company', ''));
    companies.forEach(company => {
      companySelect.add(new Option(company.name || `Company ${company.id}`, company.id));
    });
    companySelect.disabled = false;
    if (companies.length === 0) {
      companySelect.replaceChildren(new Option('No accessible companies found', ''));
      showDataHelp('No companies came back. Install your app in the Developer Sandbox company using its Sandbox App Version Key, make sure your Sandbox user can access that company, then refresh.');
    }
  } catch (error) {
    companySelect.replaceChildren(new Option(error.message, ''));
    projectList.innerHTML = '<p class="empty-state">The company list could not be loaded.</p>';
    showDataHelp(helpFor(error));
  }
}

codeEntryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = codeEntryForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  codeEntryForm.hidden = true;
  codeEntryFeedback.hidden = false;
  codeEntryRetry.hidden = true;
  codeEntryStatus.textContent = 'Exchanging code with Procore Sandbox...';

  try {
    const response = await fetch(codeEntryForm.action, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(new FormData(codeEntryForm))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Code exchange failed (${response.status}).`);

    codeEntryStatus.textContent = 'Connected. Loading Sandbox companies...';
    await activateConnectedSession(true);
  } catch (error) {
    codeEntryStatus.textContent = `${error.message} See "Having trouble connecting?" below.`;
    codeEntryRetry.hidden = false;
    troubleDetails.open = true;
  }
});

companySelect.addEventListener('change', () => {
  const companyId = companySelect.value;
  const companyName = companySelect.selectedOptions[0]?.textContent || 'your company';
  if (companyId) loadProjects(companyId, companyName);
});

async function initialize() {
  try {
    const session = await getJson('/api/session');
    if (session.credentialProblem) {
      credentialWarning.textContent = session.credentialProblem;
      credentialWarning.hidden = false;
      troubleDetails.open = true;
    }
    if (!session.connected) return;

    await activateConnectedSession();
  } catch (error) {
    showError(projectList, error.message);
  }
}

initialize();

// Bonus exercise: show events received by the optional webhook listener (see the README).
async function loadWebhookEvents() {
  try {
    const { enabled, listenerUrl, hook, events } = await getJson('/api/webhook-events');
    webhookPanel.hidden = !enabled;
    if (!enabled) return;
    webhookUrl.value = listenerUrl;
    const hadHook = Boolean(currentHook);
    currentHook = hook;
    renderHookControls();
    if (hook && !hadHook && !webhookStatus.textContent) {
      webhookStatus.textContent = `Webhook ${hook.hookId} is active. Make a change in Procore and watch for events below.`;
    }
    webhookEvents.replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      item.textContent = `${event.receivedAt.slice(11, 19)}  ${event.resourceType}  ${event.reason}  (id ${event.resourceId || 'n/a'}, project ${event.projectId || 'n/a'})`;
      return item;
    }));
    webhookEmpty.hidden = events.length > 0;
    setTimeout(loadWebhookEvents, 5000);
  } catch {
    webhookPanel.hidden = true;
  }
}

// Registering the bonus webhook from the dashboard. Nothing is sent until the box is ticked and the button clicked.
let webhookCompanyId = '';

function fillWebhookProjects(companyId) {
  webhookCompanyId = companyId;
  webhookProject.replaceChildren(new Option('Select a project', ''));
  loadedProjects.forEach(project => webhookProject.add(new Option(project.name || `Project ${project.id}`, project.id)));
  webhookProject.disabled = loadedProjects.length === 0;
  webhookPreview.textContent = 'Choose a project to preview the request.';
  updateWebhookCreateState();
}

function renderHookControls() {
  webhookDelete.hidden = !currentHook;
  updateWebhookCreateState();
}

function updateWebhookCreateState() {
  webhookCreate.disabled = !(webhookCompanyId && webhookProject.value && webhookConfirm.checked) || Boolean(currentHook);
}

webhookProject.addEventListener('change', async () => {
  webhookConfirm.checked = false;
  updateWebhookCreateState();
  if (!webhookProject.value) {
    webhookPreview.textContent = 'Choose a project to preview the request.';
    return;
  }
  try {
    const preview = await getJson(`/api/webhook-hook/preview?company_id=${encodeURIComponent(webhookCompanyId)}&project_id=${encodeURIComponent(webhookProject.value)}`);
    webhookPreview.textContent = `${preview.hook.method} ${preview.hook.endpoint}\n${JSON.stringify(preview.hook.body, null, 2)}\n\nThen add ${preview.triggers.length} triggers:\n` +
      [...new Set(preview.triggers.map(trigger => trigger.resource_name))].join(', ');
  } catch (error) {
    webhookPreview.textContent = error.message;
  }
});

webhookConfirm.addEventListener('change', updateWebhookCreateState);

webhookCreate.addEventListener('click', async () => {
  webhookCreate.disabled = true;
  webhookStatus.textContent = 'Creating webhook...';
  try {
    const response = await fetch('/api/webhook-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ company_id: webhookCompanyId, project_id: webhookProject.value, confirm: webhookConfirm.checked })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body.hookId) currentHook = { hookId: body.hookId };
      throw new Error(body.error || `Request failed (${response.status}).`);
    }
    currentHook = { hookId: body.hookId };
    webhookConfirm.checked = false;
    webhookStatus.textContent = `Webhook ${body.hookId} created with ${body.triggerCount} triggers. Make a change in Procore and watch for events below.`;
    renderHookControls();
  } catch (error) {
    renderHookControls();
    webhookStatus.textContent = error.message;
  }
});

webhookDelete.addEventListener('click', async () => {
  webhookDelete.disabled = true;
  try {
    const response = await fetch('/api/webhook-hook', { method: 'DELETE', headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    currentHook = null;
    webhookStatus.textContent = 'Webhook deleted from your Sandbox project.';
    renderHookControls();
  } catch (error) {
    webhookStatus.textContent = error.message;
  } finally {
    webhookDelete.disabled = false;
  }
});

// Side drawer for API lookup, so search never pushes the next step down the page.
function setDrawer(open) {
  catalogDrawer.hidden = !open;
  drawerBackdrop.hidden = !open;
  catalogOpenButtons[0].setAttribute('aria-expanded', String(open));
  if (open) catalogQuery.focus();
  else catalogOpenButtons[0].focus();
}

catalogOpenButtons.forEach(button => button.addEventListener('click', () => setDrawer(true)));
catalogClose.addEventListener('click', () => setDrawer(false));
drawerBackdrop.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !catalogDrawer.hidden) setDrawer(false);
});

// Seed ideas for the "What will you build?" panel. `kind` tells people up front whether an idea changes Procore data.
const IDEAS = [
  { kind: 'writes', label: 'Create projects from a spreadsheet', goal: 'Create a Procore Sandbox project from a row of a spreadsheet (for example a Google Sheet or CSV of project name, location, and dates). Show a preview of each row first and create only one project after I confirm.' },
  { kind: 'writes', label: 'Upload a file to Documents', goal: 'Upload a file from my computer into a Sandbox project\'s Documents tool using the uploads-first flow, then show me the new file in Procore.' },
  { kind: 'listens', label: 'Show live project changes', goal: 'Extend the webhook bonus so that changes to project dates, files, and folders in a Sandbox project appear in a live feed in this app.' },
  { kind: 'reads', label: 'Summarize my projects', goal: 'Read all projects for a Sandbox company, following pagination, and show a summary table of names, stages, and dates with an option to download it as CSV.' },
  { kind: 'reads', label: 'Browse the project directory', goal: 'Show the users and vendors in a Sandbox company with search and pagination.' }
];
const KIND_LABEL = { writes: 'changes data', listens: 'listens', reads: 'read-only' };

IDEAS.forEach(idea => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'idea-chip';
  const label = document.createElement('span');
  label.textContent = idea.label;
  const tag = document.createElement('small');
  tag.textContent = KIND_LABEL[idea.kind];
  chip.append(label, tag);
  chip.addEventListener('click', () => {
    buildGoalInput.value = idea.goal;
    ideaChips.querySelectorAll('.idea-chip').forEach(other => other.classList.toggle('is-selected', other === chip));
    copilotCopyStatus.textContent = '';
  });
  ideaChips.append(chip);
});
buildGoalInput.placeholder = 'Describe your own idea, or pick one above.';

// Celebrate the first connection in this browser session. Respects reduced-motion settings.
function showConnectedBanner(scrollToIt) {
  connectedBanner.hidden = false;
  if (sessionStorage.getItem('celebrated')) return;
  sessionStorage.setItem('celebrated', '1');
  if (scrollToIt) connectedBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ff5200', '#d7ed78', '#e97862', '#5275d8', '#276b50'];
  confettiBox.replaceChildren(...Array.from({ length: 36 }, (_, index) => {
    const piece = document.createElement('i');
    piece.style.left = `${Math.round(Math.random() * 100)}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.round(Math.random() * 400)}ms`;
    piece.style.animationDuration = `${1400 + Math.round(Math.random() * 1200)}ms`;
    piece.style.transform = `rotate(${Math.round(Math.random() * 180)}deg)`;
    return piece;
  }));
  setTimeout(() => confettiBox.replaceChildren(), 3200);
}

// Turn common failures into a next step instead of a bare error.
function helpFor(error) {
  if (error.status === 401) return 'Your session expired or was never connected. Access tokens last 90 minutes, and restarting npm start clears them. Select Connect to Sandbox again.';
  if (error.status === 403) return 'Procore refused the request. Check that your app is installed in this company (App Management), and that your app has the permissions this call needs in the Developer Portal.';
  if (error.status === 429) return 'You hit the Procore rate limit. Wait a minute and try again.';
  return 'That did not work. Check the terminal where npm start is running for details, then try again. The README troubleshooting notes cover common causes.';
}

function showDataHelp(message) {
  dataHelp.textContent = message;
  dataHelp.hidden = false;
}
