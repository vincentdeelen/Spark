import { useState } from 'react'
import { equivalentNames, library, searchTextOf } from '../../circuit/library.js'
import { TRANSFORMER_CATALOG, catalogName, catalogSearchText, catalogTool } from '../../circuit/transformerCatalog.js'
import { symbolViewBox } from '../symbols/symbolViewBox.js'
import CircuitSymbol from '../symbols/CircuitSymbol.jsx'
import Icon from '../ui/Icon.jsx'
import '../../styles/panel.css'
import './ComponentLibrary.css'

const CATEGORIES = ['PASSIVE', 'TRANSFORMERS', 'TRANSFORMER CATALOG', 'RESISTORS', 'CAPACITORS', 'DIODES', 'FUSES', 'SEMICONDUCTORS', 'TUBES', 'POWER', 'CONNECTORS']
const CATEGORY_LABELS = { TUBES: 'TUBES · VALVES' }
export const DRAG_TYPE = 'application/x-live-wire-component'
const STORAGE_KEY = 'live-wire-collapsed-categories'

function loadCollapsed() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return new Set(Array.isArray(saved) ? saved.filter((name) => CATEGORIES.includes(name)) : [])
  } catch {
    return new Set()
  }
}

// Known transformers are offered like parts: placing one gives a transformer with that part's details filled in.
const catalogItems = TRANSFORMER_CATALOG.map((entry) => ({
  type: catalogTool(entry),
  name: catalogName(entry),
  title: entry.title,
  category: 'TRANSFORMER CATALOG',
  symbolType: entry.type,
  searchText: catalogSearchText(entry),
}))
const searchTextFor = (item) => item.searchText ?? searchTextOf(item)

export default function ComponentLibrary({ tool, onToolChange }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const filteredLibrary = [...library, ...catalogItems].filter((item) => searchTextFor(item).toLowerCase().includes(search.trim().toLowerCase()))
  const searching = search.trim() !== ''

  const updateCollapsed = (next) => {
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // The layout simply is not remembered when storage is unavailable.
    }
  }
  const toggle = (category) => {
    const next = new Set(collapsed)
    if (!next.delete(category)) next.add(category)
    updateCollapsed(next)
  }
  const allCollapsed = CATEGORIES.every((category) => collapsed.has(category))

  return (
    <aside className="library-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">YOUR TOOLBOX</div>
          <h2>Components</h2>
        </div>
        <span className="component-count">{library.length}</span>
      </div>
      <div className="search-wrap">
        <Icon name="search" size={16} />
        <input placeholder="Search components..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search components" />
      </div>
      <button type="button" className="collapse-all" onClick={() => updateCollapsed(allCollapsed ? new Set() : new Set(CATEGORIES))} disabled={searching}>
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
      <div className="library-scroll">
        {CATEGORIES.map((category) => {
          const items = filteredLibrary.filter((item) => item.category === category)
          if (!items.length) return null
          // While searching, matching categories stay open so results are never hidden.
          const open = searching || !collapsed.has(category)
          return (
            <section className={`library-section ${open ? '' : 'collapsed'}`} key={category}>
              <button
                type="button"
                className="section-label section-toggle"
                aria-expanded={open}
                aria-controls={`library-${category.replace(/\s+/g, '-')}`}
                onClick={() => toggle(category)}
                disabled={searching}
              >
                {CATEGORY_LABELS[category] ?? category}
                <Icon name="chevron" size={14} />
              </button>
              <div className="component-grid" id={`library-${category.replace(/\s+/g, '-')}`} hidden={!open}>
                {items.map((item) => (
                  <button
                    key={item.type}
                    className={`component-card ${tool === item.type ? 'active' : ''}`}
                    onClick={() => onToolChange(item.type)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, item.type)
                      event.dataTransfer.effectAllowed = 'copy'
                      const symbol = event.currentTarget.querySelector('svg')
                      if (symbol) event.dataTransfer.setDragImage(symbol, symbol.clientWidth / 2, symbol.clientHeight / 2)
                    }}
                    title={`Drag onto the circuit or click to place ${item.name}${item.title ? `: ${item.title}` : ''}${equivalentNames(item).length ? ` (also ${equivalentNames(item).slice(0, 3).join(', ')})` : ''}`}
                  >
                    <svg aria-hidden="true" viewBox={symbolViewBox(item.symbolType ?? item.type, { pins: [1, 2, 3, 4] })}>
                      <CircuitSymbol type={item.symbolType ?? item.type} speed={item.defaults?.speed} section={item.defaults?.section} pins={[1, 2, 3, 4]} />
                    </svg>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
        {!filteredLibrary.length && <p className="empty-search">No components found.</p>}
      </div>
      <div className="library-tip">
        <div className="tip-icon">✳</div>
        <div>
          <strong>Good to know</strong>
          <p>Drag a component onto the canvas, or select it and click where it should go.</p>
        </div>
      </div>
    </aside>
  )
}
