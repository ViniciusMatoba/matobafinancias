// Lint só das Cloud Functions, com UMA regra: identificador não definido (no-undef).
// Pega o erro típico de reorganizar código em módulos — um import esquecido, que só estouraria
// em produção quando aquela função rodasse. Uso: npm run lint:functions
import globals from 'globals';

export default [
  {
    files: ['functions/**/*.js'],
    ignores: ['functions/node_modules/**', 'functions/__tests__/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
];
