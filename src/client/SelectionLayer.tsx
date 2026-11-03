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
import { AnnotationPanel } from './AnnotationPanel.tsx'
import type { DraftSelection } from './contract.ts'
import type { Translate } from './locales.ts'
import type { NotesStore } from './store.ts'
import { supported } from './highlights.ts'
import { useNotes } from './useNotes.ts'
import { composeMessage } from './compose.ts'

/** Elements that delimit a selectable block; a range may not cross two. */
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,figcaption'

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
 * Find the block element that owns a selection endpoint.
 * @param node - endpoint node.
 * @returns the closest block, or null.
 */
function blockOf(node: Node): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return element === null ? null : element.closest(BLOCK_SELECTOR)
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
      event.preventDefault()
      const endMessage = owningMessage(range.endContainer)
      if (endMessage !== message || blockOf(range.startContainer) !== blockOf(range.endContainer)) {
        return
      }
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
      if (target.closest('[data-dsh-notes]') === null) setComposer(null)
    }

    /** Escape closes the composer; the menu listens for its own Escape. */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setComposer(null)
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
        // The trajectory tab and other views remove the transcript while the
        // composer (and this panel) stay mounted; nothing in the column can be
        // annotated any more, so the column closes with it.
        if (store.getSnapshot().panelOpen && document.querySelector('[data-chat-flow]') === null) {
          store.togglePanel(false)
          return
        }
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
          { id: 'insert', label: t('menu.insert') },
          { id: 'copy', label: t('menu.copy') },
        ]
      : [
          { id: 'unannotate', label: t('menu.unannotate') },
          { id: 'insert', label: t('menu.insert') },
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
    if (id === 'insert') {
      // Shortcut path: the excerpt goes straight into the composer and nothing
      // is stored. Selecting inside an existing note reuses that note so the
      // hand-off keeps whatever the user already wrote.
      const existing = opened.overlapId === undefined
        ? undefined
        : snapshot.annotations.find(item => item.id === opened.overlapId)
      store.insertText(composeMessage(
        existing?.quote ?? opened.draft.quote,
        existing?.note ?? '',
        '',
        t('note.label'),
      ))
      window.getSelection()?.removeAllRanges()
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
      <AnnotationPanel store={store} t={t} />

      <Menu
        open={menu !== null}
        portal
        compact
        align="start"
        listClassName="dsh-notes-menu-surface"
        items={menuItems}
        onSelect={handleMenuSelect}
        onClose={() => { setMenu(null) }}
        getAnchorRect={() => menu === null ? null : new DOMRect(menu.x, menu.y, 0, 0)}
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
            <button type="button" data-primary="true" onClick={saveAnnotation}>{t('composer.save')}</button>
          </div>
        </div>
      )}

    </>
  )
}
