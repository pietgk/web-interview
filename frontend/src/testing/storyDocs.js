/**
 * Attach a story-level explanation using the shape Storybook Docs consumes.
 *
 * @param {string} story
 */
export const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})
