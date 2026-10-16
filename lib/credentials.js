// Detects missing Procore credentials, including the placeholder values copied from .env.example,
// and explains the fix for where the app is running.
const isUnset = value => !value || value.startsWith('your-');

function credentialProblem(env = process.env) {
  if (!isUnset(env.PROCORE_CLIENT_ID) && !isUnset(env.PROCORE_CLIENT_SECRET)) return null;
  if (env.CODESPACE_NAME) {
    return 'Procore credentials are not loaded. Add PROCORE_CLIENT_ID and PROCORE_CLIENT_SECRET as Codespaces secrets ' +
      '(GitHub Settings > Codespaces > Secrets, with access to this repository), then rebuild the Codespace ' +
      '(Command Palette > Codespaces: Rebuild Container). To try the app right now, put the values in .env and restart npm start.';
  }
  return 'Procore credentials are missing. Set PROCORE_CLIENT_ID and PROCORE_CLIENT_SECRET in your .env file, then restart npm start.';
}

module.exports = { credentialProblem };
