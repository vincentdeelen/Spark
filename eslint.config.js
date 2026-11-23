import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Layers, lowest first. A layer may import from the ones below it, never from the ones above, so the domain code (circuit,
// tubes, simulation, bom, importing, project) stays free of React and can be tested without a browser. See ARCHITECTURE.md.
const UI = ['**/components/**', '**/hooks/**', '**/App.jsx']
const layer = (folder, banned, why) => ({
  files: [`src/${folder}/**/*.{js,jsx}`],
  ignores: ['**/*.test.js'],
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: banned, message: why }] }] },
})

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  layer('shared', ['../**'], 'shared/ is the bottom layer: it imports nothing from the other folders.'),
  layer('tubes', ['../circuit/**', '../simulation/**', '../bom/**', '../importing/**', '../project/**', ...UI], 'tubes/ only builds on shared/.'),
  layer('circuit', ['../simulation/**', '../bom/**', '../importing/**', '../project/**', ...UI], 'circuit/ is the core model: it builds only on shared/ and tubes/.'),
  layer('simulation', ['../bom/**', '../importing/**', '../project/**', ...UI], 'simulation/ builds only on circuit/, tubes/ and shared/.'),
  layer('bom', UI, 'bom/ is domain code and must not import React components or hooks.'),
  layer('importing', UI, 'importing/ is domain code and must not import React components or hooks.'),
  layer('project', UI, 'project/ is domain code and must not import React components or hooks.'),
])
