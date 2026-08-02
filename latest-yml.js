// latest-yml.js
// Generates the latest.yml feed file consumed by the Electron
// auto-updater, pointing clients at the newest packaged installer.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const appConfig = require('./app.config');

function sha512(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha512').update(buffer).digest('base64');
}

function generate({ outDir = path.join(__dirname, 'out', 'make'), installerFile } = {}) {
  if (!installerFile || !fs.existsSync(installerFile)) {
    console.log('No installer file provided/found; skipping latest.yml generation.');
    return null;
  }

  const stats = fs.statSync(installerFile);
  const yml = [
    `version: ${appConfig.version}`,
    `files:`,
    `  - url: ${path.basename(installerFile)}`,
    `    sha512: ${sha512(installerFile)}`,
    `    size: ${stats.size}`,
    `path: ${path.basename(installerFile)}`,
    `sha512: ${sha512(installerFile)}`,
    `releaseDate: '${new Date().toISOString()}'`
  ].join('\n');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'latest.yml');
  fs.writeFileSync(outPath, yml, 'utf8');
  console.log(`Wrote ${outPath}`);
  return outPath;
}

if (require.main === module) {
  const installerFile = process.argv[2];
  generate({ installerFile });
}

module.exports = { generate };
