import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/wasm', 'src/routeTree.gen.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Downgraded to a warning: this (React Compiler-era) rule flags any
      // setState call inside an effect body, but "reset local UI feedback
      // state when new external data arrives" (e.g. a fresh pattern
      // loading, an OctoPrint poll settling) is a legitimate effect use,
      // not the simple prop-mirroring anti-pattern the rule is really
      // targeting — see PreviewCanvas's pattern-load effect and
      // useOctoStatus's fail-streak tracker for the two current cases.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
);
