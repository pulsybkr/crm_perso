import js from '@eslint/js';
import pluginNext from 'eslint-config-next';

export default [
  js.configs.recommended,
  ...pluginNext,
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**', 'suivi-brazza.js']
  },
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
];
