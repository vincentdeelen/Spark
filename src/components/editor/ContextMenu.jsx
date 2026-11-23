import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ContextMenu.css'

// A small popup menu at a screen position. An item with `children` opens a list of choices under it; an item with
// `separator` draws a dividing line, and `detail` adds a second, smaller line of text.
// It closes on Escape, on a press outside it, and when the window scrolls or resizes.
export default function ContextMenu({ x, y, title, items, onClose }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const [openKey, setOpenKey] = useState(null)

  useLayoutEffect(() => {
    const box = ref.current.getBoundingClientRect()
    setPosition({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) })
  }, [x, y, openKey])

  useEffect(() => {
    ref.current.querySelector('button:not(:disabled)')?.focus()
  }, [])

  useEffect(() => {
    const close = (event) => {
      if (event.type === 'pointerdown' && ref.current.contains(event.target)) return
      if (event.type === 'keydown' && event.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
    }
  }, [onClose])

  const move = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')]
    const next = buttons.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1)
    buttons[(next + buttons.length) % buttons.length]?.focus()
  }

  const choose = (item) => {
    if (item.children) {
      setOpenKey((current) => (current === item.key ? null : item.key))
      return
    }
    onClose()
    item.onSelect()
  }

  return (
    <div ref={ref} className="context-menu" role="menu" aria-label={title} style={position} onKeyDown={move} onContextMenu={(event) => event.preventDefault()}>
      {title && <div className="context-menu-title">{title}</div>}
      {items.map((item) =>
        item.separator ? (
          <hr key={item.key} className="context-menu-separator" />
        ) : (
          <div key={item.key}>
            <button
              type="button"
              role="menuitem"
              className={`context-menu-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              title={item.disabled ? item.hint : undefined}
              aria-haspopup={item.children ? 'menu' : undefined}
              aria-expanded={item.children ? openKey === item.key : undefined}
              onClick={() => choose(item)}
            >
              <span>
                {item.label}
                {item.detail && <small className="context-menu-detail">{item.detail}</small>}
              </span>
              {item.shortcut && <kbd className="context-menu-shortcut">{item.shortcut}</kbd>}
              {item.children && <span aria-hidden="true">{openKey === item.key ? '▾' : '▸'}</span>}
            </button>
            {item.children && openKey === item.key && (
              <div className="context-submenu" role="menu" aria-label={item.label}>
                {item.children.length === 0 && <p className="context-menu-empty">{item.emptyText || 'Nothing here yet'}</p>}
                {item.children.map((child) =>
                  child.separator ? (
                    <hr key={child.key} className="context-menu-separator" />
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      key={child.key}
                      className={`context-menu-item ${child.danger ? 'danger' : ''}`}
                      title={child.title}
                      onClick={() => choose(child)}
                    >
                      <span>
                        {child.label}
                        {child.detail && <small className="context-menu-detail">{child.detail}</small>}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  )
}
