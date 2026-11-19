/**
 * The annotation list itself: filter, rows, hand-off actions and the footer.
 *
 * Shared by the two hosts that can show it — the right sidebar tab and (until
 * it is retired) the floating card — so the rows and their behaviour cannot
 * drift apart.
 */
import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Annotation, Preset } from './contract.ts'
import type { Translate } from './locales.ts'
import type { NotesStore, ListFilter } from './store.ts'
import { useNotes } from './useNotes.ts'
import { composeRemainder } from './compose.ts'

/** Props for the list. */
export interface NotesListProps {
  /** Plugin store. */
  readonly store: NotesStore
  /** Localized copy. */
  readonly t: Translate

}

/** Pencil glyph for the note-edit trigger. */
function PencilIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M4 20h5l2.5-2.5" />
      <path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5z" />
    </svg>
  )
}

/** Disclosure chevron shared by the trigger buttons. */
function Chevron(): React.ReactElement {
  return (
    <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden focusable="false">
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Render the list.
 * @param props - store, copy and host variant.
 * @returns the header, the rows and the footer.
 */
export function NotesList({ store, t }: NotesListProps): React.ReactElement {
  const snapshot = useNotes(store)
  const [filterOpen, setFilterOpen] = useState(false)
  const [presetFor, setPresetFor] = useState<string | null>(null)
  const [overflowFor, setOverflowFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  // Only failures speak up, and inline: the hand-off succeeding is visible in
  // the composer itself, but a refused write would otherwise look like a dead
  // button.
  const [failure, setFailure] = useState<string | null>(null)
  const failureTimer = useRef(0)

  useEffect(() => () => { window.clearTimeout(failureTimer.current) }, [])

  // Never configured means the built-in pair; an explicitly empty list means
  // the user deleted every shortcut and wants no preset button at all.
  const presets: readonly Preset[] = snapshot.presets ?? [
    { label: t('preset.explain'), prompt: t('preset.explainPrompt') },
    { label: t('preset.disagree'), prompt: t('preset.disagreePrompt') },
  ]
  const primaryPreset: Preset | undefined = presets[0]
  const quotes = snapshot.annotations.filter(annotation => annotation.kind === 'quote').length
  const marks = snapshot.annotations.length - quotes
  const visible = snapshot.annotations.filter(annotation =>
    snapshot.filter === 'all' || annotation.kind === snapshot.filter)
  const unusable = [...snapshot.statuses.values()].some(status => status === 'lost' || status === 'missing')
  const filterLabel = snapshot.filter === 'mark' ? t('filter.mark') : snapshot.filter === 'all' ? t('filter.all') : t('filter.quote')

  const filterItems: MenuEntry[] = [
    { id: 'quote', label: `${t('filter.quote')} (${quotes})` },
    { id: 'mark', label: `${t('filter.mark')} (${marks})` },
    { id: 'all', label: `${t('filter.all')} (${snapshot.annotations.length})` },
  ]

  /**
   * Push composed annotation text into the composer and report the outcome.
   * @param annotation - source annotation.
   * @param instruction - what to do with the excerpt; empty for a plain hand-off.
   */
  const handOff = (annotation: Annotation, instruction: string): void => {
    const result = store.insertQuote(annotation.quote, composeRemainder(annotation.note, instruction, t('note.label')))
    if (result === 'ok') return
    window.clearTimeout(failureTimer.current)
    setFailure(result === 'busy' ? t('notice.busy') : t('notice.failed'))
    failureTimer.current = window.setTimeout(() => { setFailure(null) }, 3200)
  }

  return (
    <>
      <header className="dsh-notes-panel-head">
        <span className="dsh-notes-panel-title">
          {t('panel.count', { count: visible.length })}
        </span>
        <Menu
          open={filterOpen}
          align="start"
          compact
          portal
          listClassName="dsh-notes-menu-surface"
          items={filterItems}
          selectedId={snapshot.filter}
          onSelect={(id) => {
            store.setFilter(id as ListFilter)
            setFilterOpen(false)
          }}
          onClose={() => { setFilterOpen(false) }}
          anchor={(
            <button
              type="button"
              className="dsh-notes-trigger"
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              onClick={() => { setFilterOpen(open => !open) }}
            >
              {filterLabel}
              <Chevron />
            </button>
          )}
        />
      </header>

      <ul className="dsh-notes-list">
        {visible.length === 0 && (
          <li className="dsh-notes-empty">
            {snapshot.annotations.length === 0
              ? t('panel.empty')
              : snapshot.filter === 'mark' ? t('panel.emptyMarks') : t('panel.empty')}
          </li>
        )}
        {visible.map(annotation => {
          const status = snapshot.statuses.get(annotation.id) ?? 'missing'
          const overflowItems: MenuEntry[] = [
            {
              id: 'kind',
              label: annotation.kind === 'quote' ? t('item.toMark') : t('item.toQuote'),
            },
            { type: 'separator', id: 'sep' },
            { id: 'delete', label: t('item.delete'), danger: true },
          ]
          const presetItems: MenuEntry[] = presets.map((preset, index) => ({
            id: `p${index}`,
            label: preset.label,
          }))
          return (
            <li
              key={annotation.id}
              className="dsh-notes-item"
              data-kind={annotation.kind}
              data-active={snapshot.activeId === annotation.id ? 'true' : undefined}
              tabIndex={0}
              onClick={() => { store.setActive(annotation.id); store.reveal(annotation.id) }}
              onKeyDown={(event) => {
                // Rows are reachable and actionable from the keyboard; the
                // buttons inside them already are, so only the row itself and
                // list traversal need handling here.
                const keys = ['ArrowDown', 'ArrowUp', 'Enter', ' ']
                if (!keys.includes(event.key)) return
                event.preventDefault()
                if (event.key === 'Enter' || event.key === ' ') {
                  store.setActive(annotation.id)
                  store.reveal(annotation.id)
                  return
                }
                const rows = [...(event.currentTarget.parentElement?.querySelectorAll('.dsh-notes-item') ?? [])]
                const here = rows.indexOf(event.currentTarget)
                const next = rows[here + (event.key === 'ArrowDown' ? 1 : -1)]
                if (next instanceof HTMLElement) next.focus()
              }}
            >
              <div className="dsh-notes-quote" data-kind={annotation.kind}>{annotation.quote}</div>
              {editing?.id === annotation.id
                ? (
                  <textarea
                    className="dsh-notes-note-edit"
                    autoFocus
                    value={editing.text}
                    placeholder={t('item.notePlaceholder')}
                    onClick={(event) => { event.stopPropagation() }}
                    onChange={(event) => { setEditing({ id: annotation.id, text: event.target.value }) }}
                    onBlur={() => {
                      store.setNote(annotation.id, editing.text.trim())
                      setEditing(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation()
                        setEditing(null)
                      }
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        store.setNote(annotation.id, editing.text.trim())
                        setEditing(null)
                      }
                    }}
                  />
                )
                : (
                  <div className="dsh-notes-note-row">
                    <button
                      type="button"
                      className="dsh-notes-icon-button"
                      aria-label={t('item.editNote')}
                      title={t('item.editNote')}
                      onClick={(event) => {
                        event.stopPropagation()
                        setEditing({ id: annotation.id, text: annotation.note })
                      }}
                    >
                      <PencilIcon />
                    </button>
                    <div className="dsh-notes-note" data-empty={annotation.note.trim() === '' ? 'true' : undefined}>
                      {annotation.note.trim() === '' ? t('item.notePlaceholder') : annotation.note}
                    </div>
                  </div>
                )}
              {snapshot.diagnostics && (
                <div className="dsh-notes-meta">
                  <span className="dsh-notes-badge" data-status={status}>{status}</span>
                  <span>{`@${annotation.start}`}</span>
                </div>
              )}
              <div className="dsh-notes-actions">
                {annotation.kind === 'quote' && (
                  <button
                    type="button"
                    className="dsh-notes-action"
                    onClick={(event) => { event.stopPropagation(); handOff(annotation, '') }}
                  >
                    {t('item.add')}
                  </button>
                )}
                {annotation.kind === 'quote' && primaryPreset !== undefined && (
                  <span className="dsh-notes-split">
                    <button
                      type="button"
                      className="dsh-notes-split-main"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (primaryPreset !== undefined) handOff(annotation, primaryPreset.prompt)
                      }}
                    >
                      {primaryPreset?.label ?? t('item.explain')}
                    </button>
                    <Menu
                      className="dsh-notes-split-slot"
                      open={presetFor === annotation.id}
                      align="start"
                      compact
                      portal
                      listClassName="dsh-notes-menu-surface"
                      items={presetItems}
                      onSelect={(id) => {
                        const preset = presets[Number(id.slice(1))]
                        if (preset !== undefined) handOff(annotation, preset.prompt)
                        setPresetFor(null)
                      }}
                      onClose={() => { setPresetFor(null) }}
                      anchor={(
                        <button
                          type="button"
                          className="dsh-notes-split-chevron"
                          aria-label={t('item.morePresets')}
                          aria-haspopup="menu"
                          aria-expanded={presetFor === annotation.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            setPresetFor(current => current === annotation.id ? null : annotation.id)
                          }}
                        >
                          <IconChevronDownOutlineRegular />
                        </button>
                      )}
                    />
                  </span>
                )}
                <Menu
                  className="dsh-notes-more-slot"
                  open={overflowFor === annotation.id}
                  align="end"
                  compact
                  portal
                  listClassName="dsh-notes-menu-surface"
                  items={overflowItems}
                  onSelect={(id) => {
                    setOverflowFor(null)
                    if (id === 'kind') store.toggleKind(annotation.id)
                    if (id === 'delete') store.remove(annotation.id)
                  }}
                  onClose={() => { setOverflowFor(null) }}
                  anchor={(
                    <button
                      type="button"
                      className="dsh-notes-more"
                      aria-label={t('item.more')}
                      aria-haspopup="menu"
                      aria-expanded={overflowFor === annotation.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setOverflowFor(current => current === annotation.id ? null : annotation.id)
                      }}
                    >
                      ⋯
                    </button>
                  )}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {unusable && <div className="dsh-notes-hint">{t('panel.lostHint')}</div>}
      <footer className="dsh-notes-panel-foot">
        {failure !== null && <span className="dsh-notes-foot-note" role="status">{failure}</span>}
        <button
          type="button"
          className="dsh-notes-foot-button"
          data-on={snapshot.diagnostics ? 'true' : undefined}
          onClick={() => { store.toggleDiagnostics() }}
        >
          {t('panel.diagnostics')}
        </button>
      </footer>

    </>
  )
}
