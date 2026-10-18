import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'app/domain-framework-free',
    // Die Rechenlogik bleibt frei von Vue/Pinia/Vuetify und von UI-Schichten (Spezifikation Abschnitt 4).
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'vue-router', 'pinia', 'vuetify', 'vuetify/*', '@vue/*'],
              message: 'src/domain muss framework-frei bleiben.',
            },
            {
              group: ['@/stores/*', '@/ui/*', '@/router/*', '@/composables/*', '@/workers/*'],
              message: 'src/domain darf nicht von App-Schichten abhängen.',
            },
          ],
        },
      ],
    },
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['tests/**/*'],
    rules: {
      ...pluginVitest.configs.recommended.rules,
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectTypeOf', 'expectVectorClose'] },
      ],
    },
  },

  skipFormatting,
)
