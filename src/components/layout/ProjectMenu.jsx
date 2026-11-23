import { useEffect, useRef, useState } from 'react'
import '../../styles/buttons.css'
import './ProjectMenu.css'

// A drop-down of circuit actions: a new circuit or clearing the current one. Project-wide actions sit in the menu beside
// the project name.
export default function ProjectMenu({ onNewCircuit, onClearCircuit }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const choose = (action) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="project-menu" ref={rootRef}>
      <button type="button" className="import-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        File ▾
      </button>
      {open && (
        <div className="project-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={choose(onNewCircuit)}>
            New circuit
            <small>Add an empty circuit to this project</small>
          </button>
          <button type="button" role="menuitem" onClick={choose(onClearCircuit)}>
            Clear circuit
            <small>Remove everything drawn on the current circuit</small>
          </button>
        </div>
      )}
    </div>
  )
}
