import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'src/generated/', 'coverage/', 'eslint.config.mjs'] },
  js.configs.recommended,
  // Règles qui utilisent les types : promesses non attendues, valeurs « any »…
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // En dernier : désactive les règles de mise en forme, laissées à Prettier.
  prettier,
);
