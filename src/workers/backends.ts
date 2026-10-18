import { createWorkerPool } from './pool'
import type { SimulationBackend } from './runner'

let factory: () => readonly SimulationBackend[] = () => createWorkerPool().backends
let shared: readonly SimulationBackend[] | null = null

/** Gemeinsame Backends aller Berechnungen; der Worker-Pool entsteht beim ersten Bedarf. */
export function simulationBackends(): readonly SimulationBackend[] {
  shared ??= factory()
  return shared
}

/** Ersetzt die Backends (Tests); der nächste Bedarf erzeugt sie neu. */
export function setSimulationBackendFactory(next: () => readonly SimulationBackend[]): void {
  factory = next
  shared = null
}
