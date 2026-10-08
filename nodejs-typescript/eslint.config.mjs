import cds from '@sap/cds/eslint.config.mjs'
import tseslint from 'typescript-eslint'

/** Regras recomendadas do typescript-eslint, aplicadas só aos arquivos .ts */
const typescript = tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts'] }))

export default [
  { ignores: ['@cds-models/**', 'gen/**'] },
  ...cds.recommended,
  ...typescript,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' }
  }
]
