/**
 * Jahresrenditen eines Pfades, je Reihe ein Eintrag pro Simulationsjahr.
 * Aktien und Anleihen sind Bruttorenditen vor TER; Cash und Inflation haben keine Kosten.
 */
export interface ReturnPath {
  equity: Float64Array
  bonds: Float64Array
  cash: Float64Array
  inflation: Float64Array
}
