/**
 * The overlay-layer half: selection menu, note composer, and the
 * panel itself.
 *
 * Everything here renders as a direct child of the shell's click-through
 * overlay layer, so each element re-enables pointer events for itself and
 * nothing else. The document listeners that start an annotation live in this
 * component's effect, not at module scope.
 */
import { useEffect, useRef, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { describeSelection, owningMessage } from './anchor.ts'
import type { DraftSelection } from './contract.ts'
import type { Translate } from './locales.ts'
import type { NotesStore } from './store.ts'
import { supported } from './highlights.ts'
import { useNotes } from './useNotes.ts'
import { composeRemainder } from './compose.ts'

/** Props for the overlay half. */
export interface SelectionLayerProps {
  /** Plugin store. */
  readonly store: NotesStore
  /** Localized copy. */
  readonly t: Translate
}

/** Where the context menu sits and what it captured. */
interface MenuState {
  /** Viewport x of the pointer. */
  readonly x: number
  /** Viewport y of the pointer. */
  readonly y: number
  /** Message node key the selection belongs to. */
  readonly nodeKey: string
  /** Rendered seat the selection belongs to. */
  readonly flowKey: string
  /** Captured selection. */
  readonly draft: DraftSelection
  /** Existing annotation the selection falls inside, when any. */
  readonly overlapId: string | undefined
}

/** Where the note composer sits and what it will save. */
interface ComposerState extends MenuState {
  /** Viewport x of the selection's left edge. */
  readonly left: number
  /** Viewport y of the selection's bottom edge. */
  readonly bottom: number
}

/**
 * Whether a mutation happened inside this plugin's own chrome.
 * @param target - mutation target.
 * @returns true when the node belongs to an element stamped `data-dsh-notes`.
 */
function isOwn(target: Node): boolean {
  const element = target.nodeType === Node.ELEMENT_NODE ? target as Element : target.parentElement
  return element !== null && element.closest('[data-dsh-notes]') !== null
}

/**
 * Render the overlay surfaces and wire their document listeners.
 * @param props - store and copy.
 * @returns the panel plus any open menu or composer.
 */
export function SelectionLayer({ store, t }: SelectionLayerProps) {
  const snapshot = useNotes(store)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [note, setNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (composer !== null) textareaRef.current?.focus()
  }, [composer])

  useEffect(() => {
    /**
     * Open the menu when a text selection inside one message block is
     * right-clicked; leave every other context menu alone.
     * @param event - the DOM contextmenu event.
     */
    const onContextMenu = (event: MouseEvent): void => {
      const selection = window.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      const message = owningMessage(range.startContainer)
      if (message === null) return
      // Annotations belong to what the assistant said. On a user message the
      // handler steps aside and the browser's own menu stays available.
      if (message.getAttribute('data-chat-flow-kind') !== 'assistant-step') return
      // A selection that ends in another rendered seat has no single anchor, so
      // the plugin steps aside — before preventing anything, or it would eat the
      // native menu and leave the user with none at all. Cross-block selections
      // inside one seat are fine: the text model is the seat's whole plain text,
      // so a range over several paragraphs is still one offset span.
      if (owningMessage(range.endContainer) !== message) return
      event.preventDefault()
      const draft = describeSelection(message, range)
      if (draft === undefined) return
      const flowKey = message.getAttribute('data-chat-flow-key') ?? ''
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - 150),
        y: Math.min(event.clientY, window.innerHeight - 120),
        nodeKey: message.getAttribute('data-chat-node-key') ?? '',
        flowKey,
        draft,
        overlapId: store.findOverlapping(flowKey, draft.start, draft.end)?.id,
      })
    }

    /**
     * Close the note composer on an outside press. The selection menu is a
     * portaled Menu and owns its own dismissal: this handler used to close it
     * too, which unmounted the list on mousedown and swallowed the row click.
     */
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-dsh-notes]') !== null) return
      setComposer(null)
      // A row keeps its active highlight until the user works elsewhere; the
      // click that leaves the list is the signal, so no second click on the
      // same row is needed to clear it.
      if (store.getSnapshot().activeId !== undefined) store.setActive(undefined)
    }

    /** Escape closes the composer and drops the active row. */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setComposer(null)
      if (store.getSnapshot().activeId !== undefined) store.setActive(undefined)
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [store, t])

  // A different conversation must not inherit an open menu or composer.
  useEffect(() => {
    setMenu(null)
    setComposer(null)
    setNote('')
  }, [snapshot.viewEpoch])

  useEffect(() => {
    if (!supported()) console.warn('dsh-plugin-highlight-notes: CSS Custom Highlight API unavailable')
  }, [store, t])

  useEffect(() => {
    let scheduled = 0
    const observer = new MutationObserver(mutations => {
      if (mutations.every(mutation => isOwn(mutation.target))) return
      if (scheduled !== 0) return
      scheduled = requestAnimationFrame(() => {
        scheduled = 0
        store.refresh()
      })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    return () => {
      observer.disconnect()
      if (scheduled !== 0) cancelAnimationFrame(scheduled)
    }
  }, [store])

  const menuItems: MenuEntry[] = menu === null
    ? []
    : menu.overlapId === undefined
      ? [
          { id: 'mark', label: t('menu.mark') },
          { id: 'quote', label: t('menu.annotate') },
          { id: 'copy', label: t('menu.copy') },
        ]
      : [
          { id: 'unannotate', label: t('menu.unannotate') },
          { id: 'copy', label: t('menu.copy') },
        ]

  /**
   * Act on the selection menu; every branch closes it.
   * @param id - the chosen row id.
   */
  const handleMenuSelect = (id: string): void => {
    const opened = menu
    setMenu(null)
    if (opened === null) return
    if (id === 'unannotate') {
      store.remove(opened.overlapId ?? '')
      window.getSelection()?.removeAllRanges()
      return
    }
    if (id === 'copy') {
      void navigator.clipboard?.writeText(opened.draft.quote)
      return
    }
    if (id === 'quote') {
      setComposer({ ...opened, left: opened.x, bottom: opened.y })
      setNote('')
      return
    }
    store.add({
      id: crypto.randomUUID(),
      sessionId: snapshot.sessionId ?? '',
      kind: 'mark',
      nodeKey: opened.nodeKey,
      flowKey: opened.flowKey,
      start: opened.draft.start,
      end: opened.draft.end,
      quote: opened.draft.quote,
      prefix: opened.draft.prefix,
      suffix: opened.draft.suffix,
      note: '',
      createdAt: new Date().toISOString(),
    })
    window.getSelection()?.removeAllRanges()
  }

  /**
   * Hand the pending selection to the composer without storing it.
   *
   * The shortcut exists because the common case is "I want this passage in my
   * next message", where creating a permanent annotation first is a detour.
   */
  const insertFromComposer = (): void => {
    const opened = composer
    if (opened === null) return
    store.insertQuote(opened.draft.quote, composeRemainder(note, '', t('note.label')))
    setComposer(null)
    setNote('')
    window.getSelection()?.removeAllRanges()
  }

  /**
   * Save the pending selection as an annotation.
   */
  const saveAnnotation = (): void => {
    if (composer === null) return
    store.add({
      id: crypto.randomUUID(),
      sessionId: snapshot.sessionId ?? '',
      kind: 'quote',
      nodeKey: composer.nodeKey,
      flowKey: composer.flowKey,
      start: composer.draft.start,
      end: composer.draft.end,
      quote: composer.draft.quote,
      prefix: composer.draft.prefix,
      suffix: composer.draft.suffix,
      note,
      createdAt: new Date().toISOString(),
    })
    setComposer(null)
    setNote('')
  }

  return (
    <>
      <Menu
        open={menu !== null}
        portal
        compact
        align="start"
        listClassName="dsh-notes-menu-surface"
        items={menuItems}
        onSelect={handleMenuSelect}
        onClose={() => { setMenu(null) }}
        // 0.2.2 replaced the measured-rect hook with a captured pointer point
        // (the list is placed with CSS anchor positioning); passing the old
        // prop silently anchored the menu to the inline wrapper at the origin.
        anchorPoint={menu === null ? undefined : { x: menu.x, y: menu.y }}
        anchor={<span data-notes-anchor="" />}
      />

      {composer !== null && (
        <div
          className="dsh-notes-composer"
          data-dsh-notes=""
          style={{
            left: Math.min(composer.left, window.innerWidth - 320),
            top: Math.min(composer.bottom + 8, window.innerHeight - 160),
          }}
        >
          <textarea
            ref={textareaRef}
            value={note}
            placeholder={t('composer.placeholder')}
            onChange={event => { setNote(event.target.value) }}
          />
          <div className="dsh-notes-composer-row">
            <button
              type="button"
              onClick={() => {
                window.getSelection()?.removeAllRanges()
                setComposer(null)
                setNote('')
              }}
            >
              {t('composer.cancel')}
            </button>
            <button type="button" onClick={insertFromComposer}>{t('composer.insert')}</button>
            <button type="button" data-primary="true" onClick={saveAnnotation}>{t('composer.save')}</button>
          </div>
        </div>
      )}

    </>
  )
}
