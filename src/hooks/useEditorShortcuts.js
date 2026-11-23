import { useEffect, useRef } from 'react'

const TEXT_INPUTS = ['INPUT', 'TEXTAREA', 'SELECT']

// Window-level editor shortcuts. Handlers may change every render; the listener is only re-bound when `enabled` flips.
export default function useEditorShortcuts(enabled, handlers) {
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!enabled) return undefined
    const onKeyDown = (event) => {
      if (TEXT_INPUTS.includes(document.activeElement?.tagName)) return
      const { undo, redo, removeSelected, escape, selectTool, wireTool } = handlersRef.current
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.key === 'Delete' || event.key === 'Backspace') removeSelected()
      else if (event.key === 'Escape') escape()
      else if (key === 'v') selectTool()
      else if (key === 'w') wireTool()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
