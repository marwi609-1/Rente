import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { APP_VERSION, displayVersion } from '@/utils/version'

describe('Programmversion', () => {
  it('zeigt Major.Minor mit zweistelliger Minor-Nummer', () => {
    expect(displayVersion('1.3.0')).toBe('1.03')
    expect(displayVersion('1.10.0')).toBe('1.10')
    expect(displayVersion('2.0.0')).toBe('2.00')
    expect(displayVersion('1.3.1')).toBe('1.03.1')
    expect(displayVersion('1.4.0-beta.1')).toBe('1.4.0-beta.1')
  })

  it('übernimmt die Version aus package.json', () => {
    const { version } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(APP_VERSION).toBe(displayVersion(version))
  })
})
