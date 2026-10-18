/**
 * Anzeigeform der Programmversion: package.json führt sie als Semver, angezeigt wird Major.Minor mit
 * zweistelliger Minor-Nummer und, falls vorhanden, angehängter Patch-Nummer:
 * 1.3.0 → „1.03“, 1.10.0 → „1.10“, 1.3.1 → „1.03.1“. Andere Formen bleiben unverändert.
 */
export function displayVersion(semver: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver)
  if (!match) return semver
  const [, major, minor, patch] = match
  const base = `${major}.${minor.padStart(2, '0')}`
  return patch === '0' ? base : `${base}.${patch}`
}

/** Version dieses Builds in Anzeigeform. */
export const APP_VERSION = displayVersion(__APP_VERSION__)
