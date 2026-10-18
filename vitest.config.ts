import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Domänentests laufen in Node; Komponententests setzen per Kommentar `@vitest-environment jsdom`.
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup/jsdom.ts'],
      exclude: [...configDefaults.exclude],
      root: fileURLToPath(new URL('./', import.meta.url)),
      server: {
        deps: {
          inline: ['vuetify'],
        },
      },
    },
  }),
)
