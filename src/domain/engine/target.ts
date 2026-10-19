/** Rundungstoleranz in Euro beim Vergleich mit dem Zielvermögen. */
const TARGET_TOLERANCE = 0.01

/**
 * Erreicht das reale Vermögen das Zielvermögen (heutige Kaufkraft)? Ohne Ziel (0) gilt jedes
 * Vermögen als ausreichend.
 */
export function meetsTargetWealth(realWealth: number, target: number): boolean {
  return target <= 0 || realWealth >= target - TARGET_TOLERANCE
}
