import { useEffect, useRef, useState } from 'react'
import ContextMenu from '../editor/ContextMenu.jsx'
import '../../styles/buttons.css'
import './SheetBar.css'

// The tab being renamed, as a text field that saves on Enter or when it loses focus and cancels on Escape.
function RenameField({ view, onRename, onDone }) {
  const [name, setName] = useState(view.name)
  const finished = useRef(false)
  const finish = (save) => {
    if (finished.current) return
    finished.current = true
    if (save) onRename(view.id, name)
    onDone()
  }
  return (
    <input
      className="sheet-tab-rename"
      aria-label={`Rename ${view.label}`}
      value={name}
      maxLength={1000}
      autoFocus
      onFocus={(event) => event.target.select()}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(true)
        else if (event.key === 'Escape') finish(false)
      }}
    />
  )
}

// The circuits of the project as portfolio tabs with a folded corner, plus previous/next buttons to step through them.
// Right-clicking a tab (or Shift+F10 / the menu key on it) opens its actions; F2 or a double-click renames it.
export default function SheetBar({ options, activeView, bomTab, onSelect, onRemoveSection, actions }) {
  const activeRef = useRef(null)
  const index = options.findIndex((item) => item.id === activeView.id)
  const [renamingId, setRenamingId] = useState(null)
  const [menu, setMenu] = useState(null)
  const circuitCount = options.filter((item) => !item.section).length

  const focusTab = (id) => requestAnimationFrame(() => document.getElementById(`sheet-tab-${id}`)?.focus())

  const openMenu = (view, x, y) => {
    if (view.id !== activeView.id) onSelect(view.id)
    setMenu({ view, x, y })
  }

  const menuItems = (view) => {
    const position = options.findIndex((item) => item.id === view.id)
    const lastCircuit = !view.section && circuitCount <= 1
    return [
      { key: 'rename', label: 'Rename…', shortcut: 'F2', onSelect: () => setRenamingId(view.id) },
      { key: 'duplicate', label: view.section ? 'Duplicate view' : 'Duplicate circuit', onSelect: () => actions.duplicate(view.id) },
      { key: 'new', label: 'New circuit after this', onSelect: () => actions.newAfter(view.id) },
      { key: 'gap-1', separator: true },
      { key: 'left', label: 'Move left', disabled: position <= 0, hint: 'Already the first tab', onSelect: () => actions.move(view.id, -1) },
      { key: 'right', label: 'Move right', disabled: position >= options.length - 1, hint: 'Already the last tab', onSelect: () => actions.move(view.id, 1) },
      { key: 'gap-2', separator: true },
      { key: 'export', label: 'Export SVG', onSelect: actions.exportSvg },
      ...(view.section ? [] : [{ key: 'clear', label: 'Clear circuit', onSelect: actions.clear }]),
      { key: 'gap-3', separator: true },
      {
        key: 'delete',
        label: view.section ? 'Delete section view' : 'Delete circuit',
        danger: true,
        disabled: lastCircuit,
        hint: 'A project keeps at least one circuit. Use Clear circuit instead.',
        onSelect: () => actions.remove(view.id),
      },
    ]
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeView.id])

  const step = (offset) => {
    const target = options[index + offset]
    if (target) onSelect(target.id)
  }

  const onKeyDown = (event) => {
    if (event.target.tagName === 'INPUT') return
    if (event.key === 'F2' || event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const view = options.find((item) => `sheet-tab-${item.id}` === event.target.id)
      if (!view) return
      event.preventDefault()
      if (event.key === 'F2') setRenamingId(view.id)
      else {
        const box = event.target.getBoundingClientRect()
        openMenu(view, box.left, box.bottom)
      }
      return
    }
    const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: options.length - 1 }
    const target = options[moves[event.key]]
    if (!(event.key in moves)) return
    event.preventDefault()
    if (!target) return
    onSelect(target.id)
    // The newly selected tab takes focus once it has rendered.
    focusTab(target.id)
  }

  return (
    <div className="sheet-bar">
      <div className="sheet-stepper">
        <button type="button" onClick={() => step(-1)} disabled={index <= 0} title="Previous circuit" aria-label="Previous circuit">
          ‹
        </button>
        <span aria-live="polite">
          {index + 1} / {options.length}
        </span>
        <button type="button" onClick={() => step(1)} disabled={index >= options.length - 1} title="Next circuit" aria-label="Next circuit">
          ›
        </button>
      </div>
      <div className="sheet-tabs" role="tablist" aria-label="Circuits" onKeyDown={onKeyDown}>
        {options.map((item) => {
          const active = item.id === activeView.id && !bomTab.active
          if (item.id === renamingId)
            return (
              <div key={item.id} className={`sheet-tab renaming${active ? ' active' : ''}${item.section ? ' linked' : ''}`}>
                <RenameField
                  view={item}
                  onRename={actions.rename}
                  onDone={() => {
                    setRenamingId(null)
                    focusTab(item.id)
                  }}
                />
              </div>
            )
          return (
            <button
              type="button"
              key={item.id}
              id={`sheet-tab-${item.id}`}
              ref={active ? activeRef : null}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`sheet-tab${active ? ' active' : ''}${item.section ? ' linked' : ''}`}
              title={item.label}
              onClick={() => onSelect(item.id)}
              onDoubleClick={() => setRenamingId(item.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                openMenu(item, event.clientX, event.clientY)
              }}
            >
              <span>{item.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          id="sheet-tab-bom"
          role="tab"
          aria-selected={bomTab.active}
          tabIndex={bomTab.active ? 0 : -1}
          className={`sheet-tab bom-tab${bomTab.active ? ' active' : ''}`}
          title="Bill of materials"
          onClick={bomTab.onSelect}
        >
          <span>Bill of materials{bomTab.count ? ` (${bomTab.count})` : ''}</span>
        </button>
      </div>
      <div className="sheet-note">
        <span>
          {bomTab.active
            ? 'Edits to the BOM also change the parts in their circuits'
            : activeView.section
              ? 'Linked view · edits and history are shared'
              : 'Each circuit has its own edit history'}
        </span>
        {activeView.section && !bomTab.active && (
          <button className="reference-button" onClick={onRemoveSection}>
            Remove section view
          </button>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={menu.view.label}
          items={menuItems(menu.view)}
          onClose={() => {
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}
