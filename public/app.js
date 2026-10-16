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
    throw new Error(details.join(' | ') || `Request failed (${response.status}).`);
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

async function activateConnectedSession() {
  statusPill.classList.add('is-connected');
  statusPill.lastChild.textContent = ' Connected';
  connectedDetails.hidden = false;
  connectButton.hidden = true;
  oauthInstructions.hidden = true;
  codeEntryForm.hidden = true;
  codeEntryFeedback.hidden = true;
  setStep('explore');
  await loadRepositoryHandoff();
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
    'For Excel-based project creation, specifically inspect PATCH /rest/v1.0/projects/sync and its warning against bulk project creation due to performance bottlenecks.'
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
      setRepositoryStatus('This Codespace is committed and synced with GitHub. Claude Code on your computer can pick up from here.', 'ready');
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
    localCopyStatus.textContent = 'Prompt copied. Paste it into Claude Code on your computer.';
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

function renderCatalogResults(operations) {
  catalogResults.replaceChildren();
  if (operations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No matching operations. Try a resource name and action, such as “projects create”.';
    catalogResults.append(empty);
    return;
  }

  operations.forEach(operation => {
    const item = document.createElement('article');
    item.className = 'operation-result';

    const titleRow = document.createElement('div');
    titleRow.className = 'operation-title-row';
    const method = document.createElement('span');
    method.className = `method-tag method-${operation.method}`;
    method.textContent = operation.method.toUpperCase();
    const path = document.createElement('code');
    path.textContent = operation.path;
    titleRow.append(method, path);

    const heading = document.createElement('h3');
    heading.textContent = operation.summary;
    const description = document.createElement('p');
    description.className = 'operation-description';
    description.textContent = operation.description;
    item.append(titleRow, heading, description);

    if (operation.requestBody?.fields?.length) {
      const fields = document.createElement('p');
      fields.className = 'schema-fields';
      fields.textContent = `Body: ${operation.requestBody.fields.map(field => `${field.name}${field.required ? '*' : ''}`).join(', ')}`;
      item.append(fields);
    }

    if (operation.caution) {
      const caution = document.createElement('p');
      caution.className = 'operation-caution';
      caution.textContent = operation.caution;
      item.append(caution);
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
    item.append(actions);
    catalogResults.append(item);
  });
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
    catalogStatus.textContent = `${result.results.length} matching operations from the live Procore OAS.`;
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
});

async function loadProjects(companyId, companyName) {
  setStep('explore');
  successPanel.hidden = true;
  projectCount.textContent = 'Loading';
  projectList.innerHTML = '<p class="empty-state">Loading Sandbox projects...</p>';

  try {
    const data = await getJson(`/api/projects?company_id=${encodeURIComponent(companyId)}`);
    const projects = Array.isArray(data) ? data : data.projects || [];
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

    successCopy.textContent = `Your app read ${projects.length} project${projects.length === 1 ? '' : 's'} from ${companyName} in Procore Sandbox.`;
    successPanel.hidden = false;
    setStep('verify');
  } catch (error) {
    projectCount.textContent = '--';
    showError(projectList, error.message);
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
    }
  } catch (error) {
    companySelect.replaceChildren(new Option(error.message, ''));
    projectList.innerHTML = '<p class="empty-state">Check Sandbox access and API permissions, then refresh.</p>';
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
    await activateConnectedSession();
  } catch (error) {
    codeEntryStatus.textContent = error.message;
    codeEntryRetry.hidden = false;
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
    if (!session.connected) return;

    await activateConnectedSession();
  } catch (error) {
    showError(projectList, error.message);
  }
}

initialize();