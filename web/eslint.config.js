import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  // Règles des hooks React (dépendances des effets, ordre des appels…).
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // En dernier : désactive les règles de mise en forme, laissées à Prettier.
  prettier,
);
