/**
 * Farben der Diagramme. Kategoriale Reihenfolge und Abstufungen stammen aus einer gegen
 * Farbfehlsichtigkeit geprüften Palette (blau, orange, aqua, gelb, magenta); hell und dunkel sind
 * eigene Abstufungen derselben Töne, geprüft gegen die Vuetify-Oberflächen #ffffff und #212121.
 */
export interface ChartTheme {
  dark: boolean
  surface: string
  ink: string
  inkSecondary: string
  muted: string
  grid: string
  axis: string
  /** kategoriale Farben in fester Reihenfolge */
  series: readonly string[]
}

const LIGHT_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const
const DARK_SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const

export function chartTheme(dark: boolean, surface: string): ChartTheme {
  return dark
    ? {
        dark,
        surface,
        ink: '#f0efec',
        inkSecondary: '#c3c2b7',
        muted: '#898781',
        grid: '#2c2c2a',
        axis: '#383835',
        series: DARK_SERIES,
      }
    : {
        dark,
        surface,
        ink: '#0b0b0b',
        inkSecondary: '#52514e',
        muted: '#898781',
        grid: '#e1e0d9',
        axis: '#c3c2b7',
        series: LIGHT_SERIES,
      }
}
