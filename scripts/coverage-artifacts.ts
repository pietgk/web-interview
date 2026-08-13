import { rm } from 'node:fs/promises'

/**
 * Delete a previously published combined explorer before withheld evidence reports are regenerated.
 */
export const removeWithheldCombinedExplorer = async ({
  coverageDirectory,
  combinedAutomation,
}: {
  coverageDirectory: string
  combinedAutomation: { status: 'available' | 'withheld' } & Record<string, unknown>
}) => {
  if (combinedAutomation.status === 'withheld') {
    await rm(coverageDirectory, { recursive: true, force: true })
  }
}
