/**
 * Annotation state for one browser.
 *
 * Annotations are keyed by session: a range points at a message seat, and a
 * seat only exists inside its own session, so the list always shows the
 * annotations of the conversation in front of the user. Nothing here reaches
 * the Session log — storage is the browser's own localStorage.
 */
import type { Annotation, AnnotationKind, InputActionsLike, Preset, ResolveStatus, TextModel } from './contract.ts'
import { locate } from './anchor.ts'
import { clear, paint } from './highlights.ts'

/** Versioned storage prefix; bumping the suffix is a breaking data change. */
const STORAGE_PREFIX = 'dsh-plugin-highlight-notes/v1/'

/** Browser-wide flag: show locating status and offsets in the list. */
const DIAGNOSTICS_KEY = 'dsh-plugin-highlight-notes/diagnostics'

/** Browser-wide list filter. */
const FILTER_KEY = 'dsh-plugin-highlight-notes/filter'

/** What the list shows: actionable notes only, plain marks only, or both. */
export type ListFilter = AnnotationKind | 'all'

/** What the UI renders from. */
export interface NotesSnapshot {
  /** Session currently displayed, absent before the first binding. */
  readonly sessionId: string | undefined
  /** Bumped whenever the conversation the store points at changes. */
  readonly viewEpoch: number
  /** Annotations of the current session, newest last. */
  readonly annotations: readonly Annotation[]
  /** Locating outcome per annotation id. */
  readonly statuses: ReadonlyMap<string, ResolveStatus>
  /** Whether the floating panel is open. */
  /** Annotation the list highlighted last. */
  readonly activeId: string | undefined
  /** Transient line shown after an action. */
  /** Whether the list exposes locating status and offsets. */
  readonly diagnostics: boolean
  /** True while a click is loading older history to reach an annotation. */
  readonly locating: boolean
  /** Which kinds the list currently shows. */
  readonly filter: ListFilter
  /** User shortcuts from the settings row; empty means "use the built-ins". */
  readonly presets: readonly Preset[] | undefined
  /** Monotonic revision; identity changes on every notify. */
  readonly revision: number
}

/** Live editor facts the store needs for a chip-safe insert. */
export interface InputFacts {
  /** Clipboard projection of the composer. */
  readonly draft: string
  /** Submission phase; anything but `plain` means the editor is locked. */
  readonly phase: string
  /** Number of reference chips in the draft. */
  readonly occurrences: number
  /** Actions for this session, when the dock entry is mounted. */
  readonly actions: InputActionsLike | undefined
}

/** Result of pushing composed text into the composer. */
export type InsertResult = 'ok' | 'busy' | 'failed'

/** Storage key for one session. */
function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

/**
 * Read the stored annotations for a session.
 * @param sessionId - owning session.
 * @returns stored annotations, or an empty list when absent or unreadable.
 */
function readStored(sessionId: string): Annotation[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => {
      const normalized = normalizeAnnotation(item)
      return normalized === undefined ? [] : [normalized]
    })
  } catch {
    // Storage disabled or hand-edited content: start empty rather than crash.
    return []
  }
}

/**
 * Turn one stored record into an annotation this build can render.
 *
 * Unknown fields are carried through, so a newer version's extra data survives
 * a downgrade instead of being erased on the next write. Unknown kinds are the
 * one thing that must not pass through: an unrecognised type would paint into
 * no registry and filter out of every view, so the next write would delete it.
 * Such a record is kept as an actionable note, which is the superset behaviour.
 * @param item - one parsed storage record.
 * @returns the annotation, or undefined when the record is unusable.
 */
/**
 * Chat turn a rendered seat key belongs to.
 *
 * Seat keys encode the turn as `assistant-step146`, `turn-process140` or
 * `turn-tail140`; annotations written before the `turn` field existed can still
 * page history back to their turn through this.
 * @param flowKey - `data-chat-flow-key` captured with the annotation.
 * @returns the turn number, or undefined when the key carries none.
 */
export function turnOfSeatKey(flowKey: string): number | undefined {
  const match = /(?:assistant-step|turn-process|turn-tail)(\d+)/.exec(flowKey)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : undefined
}

export function normalizeAnnotation(item: unknown): Annotation | undefined {
  if (typeof item !== 'object' || item === null) return undefined
  const candidate = item as Partial<Annotation>
  if (typeof candidate.id !== 'string') return undefined
  if (typeof candidate.nodeKey !== 'string') return undefined
  if (typeof candidate.start !== 'number' || typeof candidate.end !== 'number') return undefined
  if (typeof candidate.quote !== 'string') return undefined
  // Records written before kinds existed are notes; so is a kind from the future.
  const kind = candidate.kind === 'mark' ? 'mark' : 'quote'
  return { ...(item as Annotation), kind }
}

/**
 * Persist the annotations of a session.
 * @param sessionId - owning session.
 * @param list - annotations to write.
 */
function writeStored(sessionId: string, list: readonly Annotation[]): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(list))
  } catch {
    // Quota or privacy mode: the list stays live for this document only.
  }
}

/** Owner of every annotation-related fact the UI reads. */
export class NotesStore {
  private viewEpoch = 0
  private sessionId: string | undefined
  private annotations: Annotation[] = []
  private statuses = new Map<string, ResolveStatus>()
  private activeId: string | undefined
  private diagnostics = false
  /** Set while reveal() is paging history towards an annotation's turn. */
  private locating = false
  /** Guards against two reveals paging at once; only the newest may finish. */
  private locateToken = 0
  private filter: ListFilter = 'quote'
  private presets: Preset[] | undefined
  private input: InputFacts = { draft: '', phase: 'plain', occurrences: 0, actions: undefined }
  private listeners = new Set<() => void>()
  private signature = ''
  private snapshot: NotesSnapshot = {
    sessionId: undefined,
    viewEpoch: 0,
    annotations: [],
    statuses: new Map(),
    activeId: undefined,
    diagnostics: false,
    locating: false,
    filter: 'quote',
    presets: undefined,
    revision: 0,
  }

  /**
   * Point the store at a session and refresh the editor facts.
   * @param sessionId - session the conversation column is showing.
   * @param input - current composer facts for that session.
   */
  bind(sessionId: string, input: InputFacts): void {
    this.input = input
    if (this.sessionId === sessionId) return
    this.cancelReveal()
    clear()
    this.viewEpoch += 1
    this.sessionId = sessionId
    this.annotations = readStored(sessionId)
    this.activeId = undefined
    this.statuses = new Map()
    this.refresh()
  }

  /**
   * Build a bug-report payload: counts and capabilities only.
   *
   * Quotes, notes and session ids stay out of it — the point is to describe
   * the state that broke, not the user's text.
   * @returns JSON text ready for the clipboard.
   */
  diagnosticsReport(): string {
    const counts: Record<string, number> = { exact: 0, fuzzy: 0, lost: 0, missing: 0 }
    for (const status of this.statuses.values()) counts[status] = (counts[status] ?? 0) + 1
    let storageBytes = 0
    try {
      storageBytes = this.sessionId === undefined ? 0 : (localStorage.getItem(storageKey(this.sessionId))?.length ?? 0)
    } catch {
      // Storage disabled: report 0 rather than failing the copy.
    }
    return JSON.stringify({
      plugin: 'dsh-plugin-highlight-notes',
      annotations: {
        total: this.annotations.length,
        quote: this.annotations.filter(item => item.kind === 'quote').length,
        mark: this.annotations.filter(item => item.kind === 'mark').length,
        located: counts,
      },
      highlights: typeof CSS !== 'undefined' && CSS.highlights !== undefined,
      diagnosticsToggle: this.diagnostics,
      filter: this.filter,
      presets: this.presets === undefined ? 'built-in' : this.presets.length,
      storageBytes,
    }, null, 2)
  }

  /**
   * Called when the conversation view unmounts: drop the transient surfaces
   * that belong to it.
   */
  leaveConversation(): void {
    if (this.sessionId === undefined) return
    this.cancelReveal()
    this.viewEpoch += 1
    this.publish()
  }

  /** Drop highlights and listeners; used when the plugin's fiber disposes. */
  dispose(): void {
    clear()
    this.listeners.clear()
  }

  /**
   * Subscribe to state changes.
   * @param listener - called after every notify.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the current immutable snapshot. */
  getSnapshot(): NotesSnapshot {
    return this.snapshot
  }

  /**
   * Re-locate every annotation of the current session and repaint.
   * Cheap enough to run once per animation frame while a message streams.
   */
  refresh(): void {
    if (this.sessionId === undefined) return
    const cache = new Map<string, TextModel>()
    const quoteRanges: Range[] = []
    const markRanges: Range[] = []
    const statuses = new Map<string, ResolveStatus>()
    let activeQuote: Range | undefined
    let activeMark: Range | undefined
    for (const annotation of this.annotations) {
      const result = locate(annotation, cache)
      statuses.set(annotation.id, result.status)
      if (result.range === undefined) continue
      if (annotation.kind === 'mark') {
        markRanges.push(result.range)
        if (annotation.id === this.activeId) activeMark = result.range
      } else {
        quoteRanges.push(result.range)
        if (annotation.id === this.activeId) activeQuote = result.range
      }
    }
    this.statuses = statuses
    paint(quoteRanges, markRanges, activeQuote, activeMark)
    // Painting itself mutates no DOM, but the panel re-render does; skip the
    // notify when nothing the UI reads has moved, so the observer that drove
    // this refresh cannot re-trigger itself.
    // Kind and note are part of the signature: converting or editing an
    // annotation moves no offsets, so an id:status signature alone would skip
    // the notify and leave the panel showing stale text.
    const list = this.annotations
      .map(annotation => `${annotation.id}:${annotation.kind}:${annotation.note}:${statuses.get(annotation.id) ?? ''}`)
      .join(',')
    const signature = `${this.sessionId}|${this.activeId ?? ''}|${list}`
    if (signature === this.signature) return
    this.signature = signature
    this.publish()
  }

  /**
   * Store a new annotation and paint it.
   * @param annotation - the range and note to keep.
   */
  add(annotation: Annotation): void {
    if (this.sessionId === undefined) return
    this.annotations = [...this.annotations, { ...annotation, sessionId: this.sessionId }]
    this.activeId = annotation.id
    writeStored(this.sessionId, this.annotations)
    this.refresh()
  }

  /**
   * Delete one annotation.
   * @param id - annotation to drop.
   */
  remove(id: string): void {
    if (this.sessionId === undefined) return
    this.annotations = this.annotations.filter(annotation => annotation.id !== id)
    if (this.activeId === id) this.activeId = undefined
    writeStored(this.sessionId, this.annotations)
    this.refresh()
  }

  /**
   * Mark one annotation as the list's current item.
   * @param id - annotation id, or undefined to clear the highlight.
   */
  setActive(id: string | undefined): void {
    // Clearing the row also stops a paging reveal: the user has moved on, and
    // leaving the loop running would keep loading pages and scrolling the
    // transcript after the list no longer points anywhere.
    if (id === undefined) this.cancelReveal()
    this.activeId = id
    this.refresh()
  }

  /** Stop a reveal that is still paging history; safe to call when idle. */
  private cancelReveal(): void {
    if (!this.locating) return
    this.locateToken += 1
    this.locating = false
    this.publish()
  }

  /**
   * Find the annotation a selection overlaps.
   * @param flowKey - rendered seat the selection sits in.
   * @param start - selection start offset.
   * @param end - selection end offset.
   * @returns the first overlapping annotation, if any.
   */
  findOverlapping(flowKey: string, start: number, end: number): Annotation | undefined {
    return this.annotations.find(annotation =>
      annotation.flowKey === flowKey && annotation.start < end && start < annotation.end)
  }

  /**
   * Scroll the conversation so one annotation is centred in its scroll port.
   *
   * The scroll port is the conversation's own scroll container, not the
   * document: centring inside it keeps the target clear of the sticky header
   * and of the composer.
   * @param id - annotation to reveal.
   */
  reveal(id: string): void {
    const annotation = this.annotations.find(candidate => candidate.id === id)
    if (annotation === undefined) return
    const token = this.locateToken + 1
    this.locateToken = token
    const stop = (): void => {
      if (this.locateToken !== token) return
      this.locating = false
      this.publish()
    }
    // A click that lands on a mounted seat needs no paging: measure after the
    // click's own layout settles and centre it. Any page load still running for
    // a previous click is now stale, so its flag has to be dropped here too.
    const idle = (): void => {
      if (!this.locating) return
      this.locating = false
      this.publish()
    }
    if (this.centerOn(annotation)) return idle()
    // Annotations written before the field existed still carry the turn in the
    // seat key (`...assistant-step144...`), so paging works for them too.
    const turn = annotation.turn ?? turnOfSeatKey(annotation.flowKey)
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (turn === undefined || !(scroller instanceof HTMLElement)) {
      this.seatOf(annotation)?.scrollIntoView({ block: 'center' })
      return idle()
    }
    const targetTurn: number = turn
    /**
     * DSH keeps only the loaded tail of the conversation mounted and fetches
     * earlier pages when the scroller reaches the top, so an annotation in an
     * older turn cannot be located until its page arrives. Walk the history
     * backwards one page at a time until the turn is mounted, then centre it.
     */
    this.locating = true
    this.publish()
    const maxPages = 60
    let pages = 0
    const finish = (): void => {
      if (this.locateToken !== token) return
      stop()
    }
    const step = (): void => {
      if (this.locateToken !== token) return
      if (this.centerOn(annotation)) {
        // A freshly loaded page lays out one frame later; centring again after
        // that frame is what makes the second click actually land on the text.
        requestAnimationFrame(() => {
          if (this.locateToken !== token) return
          this.centerOn(annotation)
          finish()
        })
        return
      }
      const turns = [...document.querySelectorAll('[data-chat-turn]')]
        .map(row => Number(row.getAttribute('data-chat-turn')))
        .filter(value => Number.isSafeInteger(value))
      const oldest = turns.length === 0 ? undefined : Math.min(...turns)
      if (oldest !== undefined && oldest <= targetTurn) {
        // The page is in, but the seat itself is missing (collapsed region or a
        // seat the view no longer renders): land on its turn row.
        document.querySelector(`[data-chat-turn="${targetTurn}"]`)?.scrollIntoView({ block: 'center' })
        return finish()
      }
      if (pages >= maxPages) {
        this.seatOf(annotation)?.scrollIntoView({ block: 'center' })
        return finish()
      }
      pages += 1
      const height = scroller.scrollHeight
      scroller.scrollTop = 0
      const started = performance.now()
      const poll = (): void => {
        if (this.locateToken !== token) return
        if (scroller.scrollHeight !== height || performance.now() - started > 1200) step()
        else window.setTimeout(poll, 60)
      }
      window.setTimeout(poll, 60)
    }
    // Let the click's own paint settle before the first page request.
    requestAnimationFrame(step)
  }

  /**
   * Centre an annotation's range when its seat is currently mounted.
   * @param annotation - annotation to show.
   * @returns whether a range was found and scrolled to.
   */
  private centerOn(annotation: Annotation): boolean {
    const range = locate(annotation).range
    if (range === undefined) return false
    const element = range.startContainer.parentElement
    if (element === null) return false
    const scroller = element.closest('[data-conversation-scroll]')
    if (!(scroller instanceof HTMLElement)) {
      element.scrollIntoView({ block: 'center' })
      return true
    }
    // Centre the range itself, not its enclosing element: a paragraph can be
    // many lines tall and would land its first line wherever the block starts.
    const rect = range.getBoundingClientRect()
    const box = scroller.getBoundingClientRect()
    // scrollBy, not a scrollTop write: the chat view owns follow-tail and
    // overrides a jumped scrollTop, while a relative scroll survives it.
    scroller.scrollBy({ top: rect.top - box.top - box.height / 2 + rect.height / 2 })
    return true
  }

  /**
   * Find the rendered seat an annotation belongs to, even when its text cannot
   * be located right now.
   * @param annotation - annotation whose seat to find.
   * @returns the seat element, or null.
   */
  private seatOf(annotation: Annotation): HTMLElement | null {
    const seats = document.querySelectorAll<HTMLElement>('[data-chat-flow-key], [data-chat-node-key]')
    const flowKey = annotation.flowKey ?? ''
    const nodeKey = annotation.nodeKey ?? ''
    for (const seat of seats) {
      if (flowKey !== '' && seat.getAttribute('data-chat-flow-key') === flowKey) return seat
    }
    for (const seat of seats) {
      if (seat.getAttribute('data-chat-node-key') === nodeKey) return seat
    }
    return null
  }

  /** Read the persisted display flags; call once before the first render. */
  loadDiagnostics(): void {
    try {
      this.diagnostics = localStorage.getItem(DIAGNOSTICS_KEY) === '1'
      const stored = localStorage.getItem(FILTER_KEY)
      if (stored === 'quote' || stored === 'mark' || stored === 'all') this.filter = stored
    } catch {
      // Storage disabled: keep the defaults (diagnostics off, notes only).
    }
  }

  /**
   * Replace the shortcut list with the settings row's current value.
   * @param presets - configured presets; absent selects the built-ins, an empty
   * list means the user removed every shortcut.
   */
  setPresets(presets: readonly Preset[] | undefined): void {
    this.presets = presets === undefined
      ? undefined
      : presets.filter(preset => preset.label.trim() !== '' || preset.prompt.trim() !== '')
    this.publish()
  }

  /**
   * Choose which kinds the list shows and remember it for this browser.
   * @param filter - target view.
   */
  setFilter(filter: ListFilter): void {
    this.filter = filter
    try {
      localStorage.setItem(FILTER_KEY, filter)
    } catch {
      // Same degradation as above: the view still changes for this document.
    }
    this.publish()
  }

  /**
   * Replace the note on one annotation.
   * @param id - annotation to edit.
   * @param note - new note text; an empty string clears it.
   */
  setNote(id: string, note: string): void {
    if (this.sessionId === undefined) return
    this.annotations = this.annotations.map(annotation => annotation.id === id
      ? { ...annotation, note }
      : annotation)
    writeStored(this.sessionId, this.annotations)
    this.refresh()
  }

  /**
   * Flip one annotation between a plain mark and an actionable note.
   * @param id - annotation to convert.
   */
  toggleKind(id: string): void {
    if (this.sessionId === undefined) return
    this.annotations = this.annotations.map(annotation => annotation.id === id
      ? { ...annotation, kind: annotation.kind === 'quote' ? 'mark' : 'quote' }
      : annotation)
    writeStored(this.sessionId, this.annotations)
    this.refresh()
  }

  /**
   * Flip the diagnostics display and remember it for this browser.
   * @param on - target state; omitted toggles.
   */
  toggleDiagnostics(on?: boolean): void {
    this.diagnostics = on ?? !this.diagnostics
    try {
      localStorage.setItem(DIAGNOSTICS_KEY, this.diagnostics ? '1' : '0')
    } catch {
      // Same degradation as above: the toggle still works for this document.
    }
    this.publish()
  }

  /**
   * Push composed text into the composer without clobbering chips.
   *
   * An empty draft is replaced outright. A draft without reference chips is
   * appended as plain text. A draft carrying chips goes through the revision
   * guarded insert so the chips survive; a moved draft is retried once.
   * @param text - text to append.
   * @returns whether it landed.
   */
  insertText(text: string): InsertResult {
    const { actions, draft, phase, occurrences } = this.input
    if (actions === undefined) return 'failed'
    if (phase !== 'plain') return 'busy'
    if (draft.trim() === '') {
      actions.setDraft(text)
      return 'ok'
    }
    const separator = draft.endsWith('\n') ? '\n' : '\n\n'
    if (occurrences === 0) {
      actions.setDraft(`${draft}${separator}${text}`)
      return 'ok'
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const span = actions.captureInsertion()
      if (actions.insertText(`${separator}${text}`, span)) return 'ok'
    }
    return 'failed'
  }

  /**
   * Hand a quote to the composer the way the shell itself does.
   *
   * DSH 0.2.2 inserts a quote as an atomic node with its own preview and
   * remove control, so the plugin asks for that first and only falls back to
   * plain `> ` lines when the API is absent. Whatever follows the quote (the
   * note, the instruction) is appended after the node.
   * @param quote - selected excerpt, without quote markers.
   * @param rest - text to place after the quote; may be empty.
   * @returns whether both parts landed.
   */
  insertQuote(quote: string, rest: string): InsertResult {
    const { actions, phase } = this.input
    if (actions === undefined) return 'failed'
    if (phase !== 'plain') return 'busy'
    const quoted = quote.split('\n').map(line => `> ${line}`).join('\n')
    if (actions.insertQuote?.(quote) === true) {
      if (rest === '') return 'ok'
      // The quote node ends with its own space; a blank line keeps the note in
      // its own block instead of trailing the blockquote.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const span = actions.captureInsertion()
        if (actions.insertText(`\n${rest}`, span)) return 'ok'
      }
      return 'failed'
    }
    return this.insertText(rest === '' ? quoted : `${quoted}\n${rest}`)
  }

  /** Rebuild the snapshot object and notify subscribers. */
  private publish(): void {
    this.snapshot = {
      sessionId: this.sessionId,
      viewEpoch: this.viewEpoch,
      annotations: this.annotations,
      statuses: this.statuses,
      activeId: this.activeId,
        diagnostics: this.diagnostics,
      locating: this.locating,
      filter: this.filter,
      presets: this.presets,
      revision: this.snapshot.revision + 1,
    }
    for (const listener of this.listeners) listener()
  }
}
