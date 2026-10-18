import { Marked, type Tokens } from 'marked'

import type { AssumptionDoc } from '@/router'

/** Dokumente unter docs/ und ihre Ansicht in der App. */
export const DOC_FILES: Record<AssumptionDoc, string> = {
  annahmen: 'ASSUMPTIONS.md',
  modell: 'MODEL.md',
  datenquellen: 'DATA_SOURCES.md',
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const marked = new Marked({
  gfm: true,
  renderer: {
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens)
      const file = token.href.split('#')[0].split('/').pop() ?? ''
      const doc = (Object.keys(DOC_FILES) as AssumptionDoc[]).find((d) => DOC_FILES[d] === file)
      if (doc) return `<a href="#/annahmen/${doc}">${text}</a>`
      if (/^https?:\/\//.test(token.href)) {
        return `<a href="${escapeAttribute(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
      }
      // Verweise auf Dateien im Repository sind in der App nicht erreichbar.
      return text
    },
  },
})

/**
 * Wandelt die mitgelieferte Dokumentation (docs/*.md, Teil des Builds) in HTML. Verweise zwischen
 * den Dokumenten führen zur jeweiligen Ansicht, externe Links öffnen ein neues Fenster.
 */
export function renderDoc(markdown: string): string {
  return marked.parse(markdown, { async: false })
}
