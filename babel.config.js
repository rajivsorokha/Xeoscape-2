// babel.config.js
// Lets Jest transform the ES module (import/export) syntax used by the
// frontend modules under assets/js/ when they're unit tested.

module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
};
