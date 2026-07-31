export const createSeedTodoLists = () => ({
  '0000000001': {
    id: '0000000001',
    title: 'First List',
    todos: [
      {
        id: '0000000001-todo-1',
        text: 'First todo of first list!',
        completed: false,
        dueDate: null,
      },
    ],
  },
  '0000000002': {
    id: '0000000002',
    title: 'Second List',
    todos: [
      {
        id: '0000000002-todo-1',
        text: 'First todo of second list!',
        completed: false,
        dueDate: null,
      },
    ],
  },
})
