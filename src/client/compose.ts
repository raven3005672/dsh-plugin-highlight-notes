/**
 * Composer text assembly, shared by the panel actions and the selection menu.
 *
 * The order is the one the plugin settled on: quote, then the note the user
 * wrote about it, then the instruction to act on both. The quote comes first so
 * every "this passage" that follows has an antecedent, and the instruction
 * comes last because that is the operative ask.
 */

/**
 * Build the message an action drops into the composer.
 * @param quote - excerpt to quote, as rendered text.
 * @param note - user note; blank lines are dropped.
 * @param instruction - what to do with the excerpt; empty for a plain hand-off.
 * @param noteLabel - localized prefix for the note line, e.g. `My note: `.
 * @returns plain text blocks in reading order.
 */
export function composeMessage(quote: string, note: string, instruction: string, noteLabel: string): string {
  const quoted = quote.split('\n').map(line => `> ${line}`).join('\n')
  const blocks: string[] = [quoted]
  const trimmed = note.trim()
  if (trimmed !== '') blocks.push(`${noteLabel}${trimmed}`)
  if (instruction !== '') blocks.push(instruction)
  return blocks.join('\n')
}
