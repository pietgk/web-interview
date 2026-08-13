import { rm } from 'node:fs/promises'

/**
 * Delete a previously published combined explorer before withheld evidence reports are regenerated.
 *
 * @param {{coverageDirectory: string, combinedAutomation: {status: 'available' | 'withheld'} & Record<string, any>}} input
 */
export const removeWithheldCombinedExplorer = async ({ coverageDirectory, combinedAutomation }) => {
  if (combinedAutomation.status === 'withheld') {
    await rm(coverageDirectory, { recursive: true, force: true })
  }
}
