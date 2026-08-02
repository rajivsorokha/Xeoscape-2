// build.js
// Orchestrates a full production build: bundles frontend assets via
// gulp, packages the backend into a standalone binary via pkg (see
// package.json's "pkg" config and "backend:build" script), then
// invokes the Tauri CLI to produce the final installer.
//
// Usage: node build.js

const { execSync } = require('child_process');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function main() {
  console.log('Building Xeoscape...');

  run('npx gulp build');
  run('npm run backend:build');
  run('npx tauri build');

  console.log('Build complete. Installers are in ./src-tauri/target/release/bundle');
}

if (require.main === module) {
  main();
}

module.exports = { main };
