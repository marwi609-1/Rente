import type { RetirementPlan } from './types'
import { validatePlan, type PlanIssue } from './validation'

/** Aktuelle Version des Szenarioformats. */
export const SCHEMA_VERSION = 2

export type PlanImportResult =
  { ok: true; plan: RetirementPlan } | { ok: false; message: string; issues: PlanIssue[] }

/** Szenario als JSON-Datei (der Plan selbst, mit `schemaVersion`). */
export function exportPlan(plan: RetirementPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}

/**
 * Liest eine Szenario-Datei und prüft sie mit dem zod-Schema. Dateien im Ursprungsformat
 * (`schemaVersion` 1) werden abgelehnt, bis die Migration auf Version 2 vorliegt.
 */
export function importPlan(text: string): PlanImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, message: 'Die Datei enthält kein gültiges JSON.', issues: [] }
  }
  const version =
    typeof data === 'object' && data !== null && 'schemaVersion' in data
      ? (data as { schemaVersion: unknown }).schemaVersion
      : undefined
  if (version === 1) {
    return {
      ok: false,
      message:
        'Szenarien im Ursprungsformat (schemaVersion 1) können noch nicht importiert werden; die Migration auf Version 2 folgt.',
      issues: [],
    }
  }
  if (version !== SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Unbekannte schemaVersion ${JSON.stringify(version ?? null)}; erwartet wird ${SCHEMA_VERSION}.`,
      issues: [],
    }
  }
  const result = validatePlan(data)
  return result.ok
    ? { ok: true, plan: result.plan }
    : { ok: false, message: 'Die Datei enthält ungültige Eingaben.', issues: result.issues }
}
