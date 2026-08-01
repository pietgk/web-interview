import { useEffect } from 'react'
import { useMachine } from '@xstate/react'
import {
  fetchTodoLists,
  saveTodoList as persistTodoList,
} from '../api/todoLists'
import { getInspect } from './inspect'
import {
  createTodoListsMachine,
  hasUnackedChanges,
  selectViewModel,
} from './todoListsMachine'

const machine = createTodoListsMachine({
  fetchTodoLists,
  saveTodoList: persistTodoList,
})

export const useTodoLists = () => {
  const [snapshot, send, actorRef] = useMachine(machine, {
    inspect: getInspect(),
  })

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnackedChanges(actorRef.getSnapshot())) return
      event.preventDefault()
      event.returnValue = ''
    }

    const onPageHide = () => {
      actorRef.send({ type: 'FLUSH_ALL' })
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [actorRef])

  return {
    ...selectViewModel(snapshot),
    send,
  }
}
