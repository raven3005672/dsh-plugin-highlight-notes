/**
 * The floating annotation card.
 *
 * It owns only the geometry the shell does not provide — where the card sits
 * between the header rule and the composer, and how much width the transcript
 * gives up — while `NotesList` owns everything inside it.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import type { Translate } from './locales.ts'
import type { NotesStore } from './store.ts'
import { useNotes } from './useNotes.ts'
import { NotesList } from './NotesList.tsx'

/** Props for the panel card. */
export interface AnnotationPanelProps {
  /** Plugin store. */
  readonly store: NotesStore
  /** Localized copy. */
  readonly t: Translate
}

/** Card width, mirrored in the stylesheet; the transcript gives up width + 24. */
const PANEL_WIDTH = 260

/**
 * Render the panel when it is open.
 * @param props - store and copy.
 * @returns the panel card, or null while closed.
 */
export function AnnotationPanel({ store, t }: AnnotationPanelProps): React.ReactElement | null {
  const snapshot = useNotes(store)
  const [box, setBox] = useState<{ top: number; maxHeight: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!snapshot.panelOpen) {
      setBox(null)
      return
    }
    /**
     * Re-measure the three anchors: the transcript's top edge, the composer's
     * top edge, and the transcript's right edge.
     */
    const measure = (): void => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      const card = document.querySelector('[data-composer-card]')
      // 0.2.2 wraps the composer in a sticky seat that paints a 36px fade above
      // the card. Stopping at the card alone leaves the panel free to cover
      // that band whenever the card is absent for a moment.
      const seat = card?.closest('[class*="composerSeat"]')
        ?? document.querySelector('[class*="composerSeat"]')
      const scrollBox = scroll === null ? null : scroll.getBoundingClientRect()
      const top = scrollBox === null ? 84 : Math.round(scrollBox.top + 8)
      const composerTop = card?.getBoundingClientRect().top ?? seat?.getBoundingClientRect().top
      const limit = composerTop === undefined ? window.innerHeight - 96 : Math.round(composerTop - 8)
      const right = scrollBox === null
        ? 12
        : Math.max(12, Math.round(window.innerWidth - scrollBox.right + 10))
      // The transcript column is centred inside the scroll box, so padding of
      // S moves its right edge by only S/2. Solve for the S that lands the text
      // GAP pixels before the card from quantities the padding cannot move.
      if (scrollBox !== null) {
        const column = document.querySelector('[data-chat-flow]')
        const declared = column === null ? 0 : Number.parseFloat(getComputedStyle(column).maxWidth)
        const maxColumn = Number.isFinite(declared)
          ? Math.round(declared)
          : (column === null ? 0 : Math.round(column.getBoundingClientRect().width))
        const scrollWidth = Math.round(scrollBox.width)
        const gap = 14
        const clearance = 10 + (PANEL_WIDTH + 2) + gap
        const centered = maxColumn - scrollWidth + 2 * clearance
        const filled = clearance
        const ideal = scrollWidth - centered >= maxColumn ? centered : filled
        const ceiling = Math.max(0, Math.min(clearance, scrollWidth - 320))
        const shift = Math.max(0, Math.min(ideal, ceiling))
        const applied = Number.parseFloat(document.documentElement.style.getPropertyValue('--dsh-notes-shift'))
        if (!(Math.abs(shift - applied) < 1)) {
          document.documentElement.style.setProperty('--dsh-notes-shift', `${shift}px`)
        }
      }
      const maxHeight = Math.max(160, limit - top)
      setBox(previous => previous !== null && previous.top === top
        && previous.maxHeight === maxHeight && previous.right === right
        ? previous
        : { top, maxHeight, right })
    }
    measure()
    window.addEventListener('resize', measure)
    const card = document.querySelector('[data-composer-card]')
    const observer = card === null ? null : new ResizeObserver(measure)
    if (card !== null && observer !== null) observer.observe(card)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [snapshot.panelOpen])

  if (!snapshot.panelOpen) return null

  return (
    <section
      className="dsh-notes-panel"
      data-dsh-notes=""
      role="dialog"
      aria-label={t('panel.title')}
      onKeyDown={(event) => {
        // Escape belongs to the card, not to whatever inside it has focus.
        if (event.key !== 'Escape') return
        event.stopPropagation()
        store.togglePanel(false)
      }}
      style={box === null ? undefined : { top: box.top, maxHeight: box.maxHeight, right: box.right }}
    >
      <NotesList store={store} t={t} variant="panel" onClose={() => { store.togglePanel(false) }} />
    </section>
  )
}
