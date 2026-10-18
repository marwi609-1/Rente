import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { RetirementPlan } from '@/domain/model/types'

/** Gespeichertes Szenario. */
export interface StoredScenario {
  id: string
  name: string
  plan: RetirementPlan
  /** Zeitpunkt der letzten Änderung (ms seit 1970) */
  updatedAt: number
}

interface ScenarioSchema extends DBSchema {
  scenarios: { key: string; value: StoredScenario }
}

export const DB_NAME = 'ruhestandsplaner'
const DB_VERSION = 1

export type ScenarioDb = IDBPDatabase<ScenarioSchema>

/** Öffnet die Szenario-Datenbank in IndexedDB (legt sie beim ersten Aufruf an). */
export function openScenarioDb(name = DB_NAME): Promise<ScenarioDb> {
  return openDB<ScenarioSchema>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('scenarios', { keyPath: 'id' })
    },
  })
}

export async function listScenarios(db: ScenarioDb): Promise<StoredScenario[]> {
  const all = await db.getAll('scenarios')
  return all.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.updatedAt - b.updatedAt)
}

export function getScenario(db: ScenarioDb, id: string): Promise<StoredScenario | undefined> {
  return db.get('scenarios', id)
}

export async function putScenario(db: ScenarioDb, scenario: StoredScenario): Promise<void> {
  await db.put('scenarios', scenario)
}

export async function deleteScenario(db: ScenarioDb, id: string): Promise<void> {
  await db.delete('scenarios', id)
}
