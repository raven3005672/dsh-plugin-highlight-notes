/** Shared types for the annotation feature; no runtime code lives here. */

/**
 * What the user intends to do with an annotation.
 *
 * `mark` is a visual reminder only: it stays out of the list's default view
 * and cannot be handed to the composer. `quote` is an actionable note.
 */
export type AnnotationKind = 'quote' | 'mark'

/** One user-defined shortcut: the button label and the line it writes. */
export interface Preset {
  /** Button text. */
  readonly label: string
  /** Instruction line prepended to the excerpt. */
  readonly prompt: string
}

/** One stored annotation: a character range inside one message of one session. */
export interface Annotation {
  /** Stable local id, unique within the browser. */
  readonly id: string
  /** Owning session; ranges never cross sessions. */
  readonly sessionId: string
  /** Whether this annotation is an actionable note or a plain mark. */
  readonly kind: AnnotationKind
  /** `data-chat-node-key` of the message the range belongs to. */
  readonly nodeKey: string
  /** `data-chat-flow-key` of the rendered seat; one node can render two. */
  readonly flowKey: string
  /** Start offset in the message's rendered plain text. */
  readonly start: number
  /** End offset in the same coordinate space. */
  readonly end: number
  /** The selected text, used to verify and to re-find a drifted offset. */
  readonly quote: string
  /** Up to 32 characters before the range. */
  readonly prefix: string
  /** Up to 32 characters after the range. */
  readonly suffix: string
  /** User note; empty string when the annotation has none. */
  readonly note: string
  /** ISO timestamp of creation. */
  readonly createdAt: string
}

/** Outcome of locating one annotation in the current DOM. */
export type ResolveStatus = 'exact' | 'fuzzy' | 'lost' | 'missing'

/** One text node and the offsets it occupies in the concatenated model. */
export interface TextSegment {
  /** The text node itself. */
  readonly node: Text
  /** Offset of its first character. */
  readonly start: number
  /** Offset one past its last character. */
  readonly end: number
}

/** Concatenated plain text of a message plus the offset map back to its nodes. */
export interface TextModel {
  /** Every text node's value, joined in document order. */
  readonly text: string
  /** Segment table, ascending by start offset. */
  readonly segments: readonly TextSegment[]
}

/** A selection expressed as offsets plus the context needed to re-find it. */
export interface DraftSelection {
  /** Start offset in the message's plain text. */
  readonly start: number
  /** End offset in the same coordinate space. */
  readonly end: number
  /** The selected text. */
  readonly quote: string
  /** Context before the range. */
  readonly prefix: string
  /** Context after the range. */
  readonly suffix: string
}

/** One located annotation. */
export interface ResolveResult {
  /** What the locator concluded. */
  readonly status: ResolveStatus
  /** The paintable range; present for `exact` and `fuzzy` only. */
  readonly range?: Range
}

/** Editor span carrying the draft revision the insert must still match. */
export interface DraftSpan {
  /** Start offset in the draft. */
  readonly start: number
  /** End offset in the draft. */
  readonly end: number
  /** Draft revision captured with the span. */
  readonly draftRev: number
}

/** The subset of the conversation input actions this plugin calls. */
export interface InputActionsLike {
  /** Capture the caret span and the current draft revision. */
  captureInsertion(): DraftSpan
  /**
   * Insert text at a captured span.
   * @returns false when the draft moved or submission locked the editor.
   */
  insertText(text: string, span: DraftSpan): boolean
  /** Replace the whole draft with plain text. */
  setDraft(text: string): void
  /**
   * Insert one atomic quote node (DSH 0.2.2+). The sent message carries it as a
   * Markdown blockquote; the composer shows it as a removable preview.
   * @returns false when the draft refused it.
   */
  insertQuote?(text: string): boolean
}
