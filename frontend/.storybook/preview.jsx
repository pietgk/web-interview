/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  // Generate a Docs page for every story file (same as tags: ['autodocs'] on each meta).
  tags: ['autodocs'],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Flip to 'error' when the inventory is green.
      test: 'todo',
    },
  },
}

export default preview
