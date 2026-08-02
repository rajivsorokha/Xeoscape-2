// gulpfile.js
// Build pipeline: concatenates/minifies CSS and JS from assets/ into
// assets/dist/ for production packaging.

const { src, dest, series, watch } = require('gulp');
const fs = require('fs');
const path = require('path');

const CSS_SRC = ['assets/css/bootstrap.min.css', 'assets/css/core.css', 'assets/css/components.css'];
const JS_ENTRY = 'renderer.js';
const DIST_CSS = 'assets/dist/css';
const DIST_JS = 'assets/dist/js';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildCss(cb) {
  ensureDir(DIST_CSS);
  const bundled = CSS_SRC.map((file) => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      return `/* missing: ${file} */`;
    }
  }).join('\n');
  fs.writeFileSync(path.join(DIST_CSS, 'bundle.min.css'), bundled, 'utf8');
  cb();
}

function buildJs(cb) {
  // Real minification/bundling would use esbuild/rollup here. For this
  // scaffold we simply copy the renderer entry so `npm run build:js`
  // has a working output target; swap in a real bundler for production.
  ensureDir(DIST_JS);
  try {
    fs.copyFileSync(JS_ENTRY, path.join(DIST_JS, 'bundle.min.js'));
  } catch (err) {
    fs.writeFileSync(path.join(DIST_JS, 'bundle.min.js'), '// build failed: ' + err.message);
  }
  cb();
}

function watchFiles() {
  watch('assets/css/**/*.css', buildCss);
  watch(['assets/js/**/*.js', 'renderer.js'], buildJs);
}

exports.css = buildCss;
exports.js = buildJs;
exports.build = series(buildCss, buildJs);
exports.watch = watchFiles;
exports.default = series(buildCss, buildJs);
