/** Eine im Plan gewählte Option, die die Rechenlogik in dieser Version noch nicht abbildet. */
export class UnsupportedFeatureError extends Error {
  readonly feature: string

  constructor(feature: string) {
    super(`${feature} wird von der Simulations-Engine in dieser Version noch nicht unterstützt.`)
    this.name = 'UnsupportedFeatureError'
    this.feature = feature
  }
}
