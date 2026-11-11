import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'
import pluginVueI18n from '@intlify/eslint-plugin-vue-i18n'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    // Generated shadcn-vue primitives use single-word names by convention.
    name: 'app/shadcn-ui',
    files: ['src/components/ui/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    // User-visible text goes through the message files (docs/specifications/i18n.md).
    name: 'app/i18n',
    files: ['src/**/*.vue'],
    ignores: ['src/components/ui/**', 'src/**/__tests__/**'],
    plugins: { '@intlify/vue-i18n': pluginVueI18n },
    rules: {
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        {
          attributes: {
            '/.+/': ['title', 'aria-label', 'placeholder', 'label', 'description', 'hint', 'empty'],
          },
          ignorePattern: '^[-–—−#:()\\[\\]·•/×=+*?!.,;…↑↓→▶▼Σ0-9%′“”\\s]*$',
          ignoreText: ['CSV', 'PDF', 'JSON', 'Judge26', 'R', 'x', 'ms', '(MAX)', '(MIN)'],
        },
      ],
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
