import { expect, fn, within } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs'
import { TodoComposer } from './TodoComposer'
import { TodoEditor } from './TodoEditor'
import { TodoItem } from './TodoItem'

const EDITOR_SCENARIO_DAY = '2026-07-31'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoEditor>} */ ({
  title: 'Todos/TodoEditor',
  component: TodoEditor,
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoEditor** is a thin landmark: `role="region"` named **Todo editor**. It lays out its children in a column and owns no Todo logic — `TodoListForm` puts the composer and Todo rows inside it so assistive tech (and plays) can find that block.',
          'Stories only prove the region and that children render *inside* it. Composer/item behavior lives under TodoComposer and TodoItem.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Empty = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoEditor>} */ ({
  args: { children: null },
  ...storyDocs([
    '**Why:** The component’s only contract is the named region — it must stand alone with no children.',
    '**See:** A Todo editor region with no nested groups.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const region = canvas.getByRole('region', { name: 'Todo editor' })
    await expect(region).toBeInTheDocument()
    await expect(within(region).queryAllByRole('group')).toHaveLength(0)
  },
})

export const WithComposerAndTodo = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoEditor>} */ ({
  args: {
    children: (
      <>
        <TodoComposer text='' onChange={fn()} onSubmit={fn()} />
        <TodoItem
          todo={{ id: '1', text: 'Buy milk', completed: false, dueDate: null }}
          today={EDITOR_SCENARIO_DAY}
          onChange={fn()}
          onRemove={fn()}
        />
      </>
    ),
  },
  ...storyDocs([
    '**Why:** In the app the region wraps the ghost composer and the visible Todos of the active list.',
    '**See:** Todo editor region containing group New todo and group Todo: Buy milk.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const region = canvas.getByRole('region', { name: 'Todo editor' })
    await expect(within(region).getByRole('group', { name: 'New todo' })).toBeInTheDocument()
    await expect(within(region).getByRole('group', { name: 'Todo: Buy milk' })).toBeInTheDocument()
  },
})
