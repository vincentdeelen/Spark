import { useCallback, useState } from 'react'

const HISTORY_LIMIT = 50

// Diagram state with bounded undo/redo. `undo`/`redo` ask `accept(target)` first so callers can veto the step.
export default function useDiagramHistory(initialDiagram) {
  const [diagram, setDiagram] = useState(initialDiagram)
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])

  const recordHistory = useCallback((previous) => {
    setPast((history) => [...history.slice(-(HISTORY_LIMIT - 1)), previous])
    setFuture([])
  }, [])

  const commit = useCallback(
    (next) => {
      recordHistory(diagram)
      setDiagram(next)
    },
    [diagram, recordHistory],
  )

  const undo = useCallback(
    (accept = () => true) => {
      if (!past.length) return false
      const previous = past[past.length - 1]
      if (!accept(previous)) return false
      setFuture((history) => [diagram, ...history])
      setDiagram(previous)
      setPast((history) => history.slice(0, -1))
      return true
    },
    [diagram, past],
  )

  const redo = useCallback(
    (accept = () => true) => {
      if (!future.length) return false
      if (!accept(future[0])) return false
      setPast((history) => [...history, diagram])
      setDiagram(future[0])
      setFuture((history) => history.slice(1))
      return true
    },
    [diagram, future],
  )

  return { diagram, setDiagram, commit, recordHistory, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
