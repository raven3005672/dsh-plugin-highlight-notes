/**
 * Text that follows a quote in the composer.
 *
 * The quote itself is no longer plain text: DSH 0.2.2 inserts it as an atomic
 * node with its own preview, so the plugin only appends what comes after it —
 * the user's note, then the instruction.
 */

/**
 * Build the lines that follow the quote.
 * @param note - user note; blank lines are dropped.
 * @param instruction - what to do with the excerpt; empty for a plain hand-off.
 * @param noteLabel - localized prefix for the note line, e.g. `My note: `.
 * @returns the text to append, or an empty string when there is nothing.
 */
export function composeRemainder(note: string, instruction: string, noteLabel: string): string {
  const blocks: string[] = []
  const trimmed = note.trim()
  if (trimmed !== '') blocks.push(`${noteLabel}${trimmed}`)
  if (instruction !== '') blocks.push(instruction)
  return blocks.join('\n')
}
