/** Attach a story-level explanation using the shape Storybook Docs consumes. */
export const storyDocs = (story: string) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})
