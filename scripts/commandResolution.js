/**
 * Resolve terminal input by exact name or alias before considering command-name
 * prefixes. Keeping exact matches dominant means adding a longer command cannot
 * make an established command unreachable.
 *
 * @template {{name: string, aliases?: string[]}} Command
 * @param {readonly Command[]} commands
 * @param {string} typed
 * @returns {{command: Command} | {ambiguous: Command[]} | {unknown: true} | null}
 */
export const resolveCommand = (commands, typed) => {
  if (!typed) return null
  const exact = commands.find(
    (command) => command.name === typed || command.aliases?.includes(typed)
  )
  if (exact) return { command: exact }

  const matches = commands.filter((command) => command.name.startsWith(typed))
  if (matches.length === 1) return { command: matches[0] }
  if (matches.length > 1) return { ambiguous: matches }
  return { unknown: true }
}
