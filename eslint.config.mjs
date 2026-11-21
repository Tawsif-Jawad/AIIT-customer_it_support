import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
export default [
  {ignores:['node_modules/**','dist/**','docs/audits/evidence/**','docs/development-reports/evidence/**']},
  {
    files:['apps/**/*.ts','apps/**/*.tsx','packages/**/*.ts','scripts/**/*.ts','tests/**/*.ts','playwright.config.ts'],
    languageOptions:{parser:tsParser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},
    plugins:{'@typescript-eslint':tsPlugin},
    rules:{'no-debugger':'error','no-unreachable':'error','no-constant-condition':'error','no-duplicate-case':'error','constructor-super':'error','@typescript-eslint/no-floating-promises':'off','@typescript-eslint/consistent-type-imports':'error'},
  },
  {files:['apps/web/public/*.js'],languageOptions:{ecmaVersion:'latest',sourceType:'script'},rules:{'no-debugger':'error','no-unreachable':'error','no-duplicate-case':'error'}},
];
