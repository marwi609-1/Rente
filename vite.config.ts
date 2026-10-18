import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  define: {
    // Programmversion aus package.json, einzige Quelle der Versionsnummer
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // ECharts (nur die registrierten Module) bildet einen eigenen Chunk, der erst mit den
    // Ergebnisansichten geladen wird; er ist minifiziert rund 650 kB groß.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'echarts', test: /node_modules[\\/](echarts|zrender|vue-echarts)[\\/]/ },
          ],
        },
      },
    },
  },
})
