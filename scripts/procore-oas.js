const fs = require('node:fs/promises');
const path = require('node:path');
const { OPENAPI_URL, loadOpenApi, searchOperations } = require('../lib/procore-oas');

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--download') {
    const spec = await loadOpenApi();
    const outputPath = path.join(__dirname, '..', 'tmp', 'procore-openapi.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`);
    console.log(`Saved current Procore OAS to ${path.relative(process.cwd(), outputPath)}`);
    return;
  }

  const query = args.join(' ').trim();
  if (query.length < 2) {
    console.log('Usage: npm run api:search -- "projects create batch"');
    console.log('Download the formatted source: npm run api:download');
    return;
  }

  const results = await searchOperations(query, 12);
  console.log(`Source: ${OPENAPI_URL}`);
  if (results.length === 0) {
    console.log('No matching operations found. Try a resource name and action.');
    return;
  }

  for (const operation of results) {
    console.log(`\n${operation.method.toUpperCase()} ${operation.path}`);
    console.log(operation.summary);
    if (operation.parameters.length) {
      console.log(`Parameters: ${operation.parameters.map(parameter => `${parameter.name}${parameter.required ? '*' : ''} (${parameter.in})`).join(', ')}`);
    }
    if (operation.requestBody?.fields.length) {
      console.log(`Body fields: ${operation.requestBody.fields.map(field => `${field.name}${field.required ? '*' : ''} (${field.type})`).join(', ')}`);
    }
    if (operation.caution) console.log(`Caution: ${operation.caution.replace(/\s+/g, ' ').slice(0, 500)}`);
    console.log(`Docs: ${operation.documentationUrl}`);
  }
}

main().catch(error => {
  console.error(`Could not inspect Procore OAS: ${error.message}`);
  process.exitCode = 1;
});