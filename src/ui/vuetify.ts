import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { de } from 'vuetify/locale'

export function createAppVuetify() {
  return createVuetify({
    // SVG-Icons aus @mdi/js: nur tatsächlich verwendete Pfade landen im Bundle.
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'de', messages: { de } },
    theme: {
      defaultTheme: 'system',
      themes: {
        light: {
          dark: false,
          colors: { primary: '#1e5a8a', secondary: '#5b6b79' },
        },
        dark: {
          dark: true,
          colors: { primary: '#7ab3e0', secondary: '#a3b1bd' },
        },
      },
    },
  })
}
