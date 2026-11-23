import { useMemo, useState } from 'react'
import { RATING_FIELDS, BOM_OPTIONAL_RATINGS, ratingFields } from '../../circuit/ratings.js'
import { findLibraryItem } from '../../circuit/library.js'
import { inferComponentType, namedCircuits } from '../../bom/bom.js'
import { bomGaps } from '../../bom/bomSync.js'
import './BomSheet.css'

const FIXED_COLUMNS = [
  { key: 'value', title: 'Value' },
  { key: 'voltage', title: 'Voltage' },
  { key: 'wattage', title: 'Wattage' },
  { key: 'tolerance', title: 'Tolerance' },
  { key: 'description', title: 'Description' },
]

// References in the order they read: R2 before R11, resistors before capacitors.
const referenceOrder = (a, b) => {
  const [, prefixA, numberA, suffixA] = a.match(/^([A-Z]+)(\d+)(.*)$/) ?? [a, a, '0', '']
  const [, prefixB, numberB, suffixB] = b.match(/^([A-Z]+)(\d+)(.*)$/) ?? [b, b, '0', '']
  return prefixA.localeCompare(prefixB) || Number(numberA) - Number(numberB) || suffixA.localeCompare(suffixB)
}

// A table cell that is typed in freely and committed when it loses focus or Enter is pressed; Escape undoes the typing. Keyed by
// its value so it shows a change made elsewhere (the circuit, an undo).
function Cell({ value, label, disabled, options, onCommit }) {
  const commit = (next) => {
    if (next !== value) onCommit(next)
  }
  if (options) {
    return (
      <select key={value} aria-label={label} defaultValue={value} disabled={disabled} onChange={(event) => commit(event.target.value)}>
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      key={value}
      aria-label={label}
      defaultValue={value}
      disabled={disabled}
      maxLength={1000}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.currentTarget.value = value
          event.currentTarget.blur()
        }
      }}
    />
  )
}

// The project's bill of materials as a sheet of its own: one row per part, its properties in editable columns. Edits go to the
// BOM and, for value and ratings, to the part in its circuit.
export default function BomSheet({ bom, circuits, onEdit, onAddColumn, onGenerate, onAddMissing, onRemove, onOpenFiles }) {
  const [filter, setFilter] = useState('')
  const [circuitFilter, setCircuitFilter] = useState('')
  const [newColumn, setNewColumn] = useState('')
  const named = useMemo(() => namedCircuits(circuits), [circuits])
  const names = new Map(named.map((item) => [item.id, item.bomName]))
  const gaps = useMemo(() => bomGaps(circuits, bom), [circuits, bom])
  const orphans = new Set(gaps.orphans)

  const specifications = [...new Set(bom.flatMap((item) => Object.keys(item.specifications || {})))]
  const optional = BOM_OPTIONAL_RATINGS.filter((field) => field !== 'voltage' && bom.some((item) => item[field]))
  const columns = [
    ...FIXED_COLUMNS,
    ...optional.map((field) => ({ key: field, title: RATING_FIELDS[field].bom.title })),
    ...specifications.map((name) => ({ key: `spec:${name}`, title: name, specification: name })),
  ]

  const circuitOrder = new Map(circuits.map((circuit, index) => [circuit.id, index]))
  const needle = filter.trim().toLowerCase()
  const rows = bom
    .filter((item) => !circuitFilter || item.documentId === circuitFilter)
    .filter((item) => !needle || [item.label, item.type, item.value, item.description].some((text) => String(text).toLowerCase().includes(needle)))
    .sort((a, b) => (circuitOrder.get(a.documentId) ?? 0) - (circuitOrder.get(b.documentId) ?? 0) || referenceOrder(a.label, b.label))

  // Ratings a part does not have (a capacitor's wattage) are greyed out; a row without a known type accepts everything.
  const applies = (item, key) => {
    if (key === 'value' || key === 'description' || key.startsWith('spec:')) return true
    const type = item.type || inferComponentType(item.label)
    return !type || ratingFields(type).includes(key)
  }
  const valueOf = (item, column) => (column.specification ? (item.specifications?.[column.specification] ?? '') : (item[column.key] ?? ''))

  const submitColumn = (event) => {
    event.preventDefault()
    const name = newColumn.trim()
    if (!name) return
    onAddColumn(name)
    setNewColumn('')
  }

  return (
    <main className="bom-sheet" aria-label="Bill of materials">
      <header className="bom-sheet-header">
        <div>
          <h2>Bill of materials</h2>
          <p>
            {bom.length} part{bom.length === 1 ? '' : 's'} in {circuits.length} circuit{circuits.length === 1 ? '' : 's'}. Edit a cell and press Enter; values and ratings are also
            changed on the part in its circuit.
          </p>
        </div>
        <div className="bom-sheet-actions">
          <button type="button" onClick={onGenerate}>
            Generate from circuits
          </button>
          <button type="button" onClick={onOpenFiles}>
            Import / export…
          </button>
        </div>
      </header>
      {(gaps.missing.length > 0 || gaps.orphans.length > 0) && (
        <div className="bom-sheet-gaps" role="status">
          {gaps.missing.length > 0 && (
            <span>
              {gaps.missing.length} component{gaps.missing.length === 1 ? ' is' : 's are'} not in the BOM.{' '}
              <button type="button" onClick={onAddMissing}>
                Add {gaps.missing.length === 1 ? 'it' : 'them'}
              </button>
            </span>
          )}
          {gaps.orphans.length > 0 && (
            <span>
              {gaps.orphans.length} BOM row{gaps.orphans.length === 1 ? ' has' : 's have'} no component in the circuits ({gaps.orphans.map((item) => item.label).join(', ')}).{' '}
              <button type="button" onClick={() => onRemove(gaps.orphans)}>
                Remove {gaps.orphans.length === 1 ? 'it' : 'them'}
              </button>
            </span>
          )}
        </div>
      )}
      {bom.length === 0 ? (
        <div className="bom-sheet-empty">
          <p>The BOM is empty. Generate it from the components in your circuits, or import one.</p>
          <button type="button" className="bom-sheet-primary" onClick={onGenerate}>
            Generate from circuits
          </button>
        </div>
      ) : (
        <>
          <div className="bom-sheet-tools">
            <input type="search" aria-label="Filter the BOM" placeholder="Filter by reference, type, value…" value={filter} onChange={(event) => setFilter(event.target.value)} />
            {circuits.length > 1 && (
              <select aria-label="Show one circuit" value={circuitFilter} onChange={(event) => setCircuitFilter(event.target.value)}>
                <option value="">All circuits</option>
                {named.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.bomName}
                  </option>
                ))}
              </select>
            )}
            <form onSubmit={submitColumn}>
              <input aria-label="New column name" placeholder="New column, e.g. Maker" value={newColumn} maxLength={100} onChange={(event) => setNewColumn(event.target.value)} />
              <button type="submit" disabled={!newColumn.trim()}>
                Add column
              </button>
            </form>
          </div>
          <div className="bom-sheet-scroll">
            <table className="bom-sheet-table">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th>Reference</th>
                  <th>Type</th>
                  {columns.map((column) => (
                    <th key={column.key}>{column.title}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${item.documentId}\u0000${item.label}`} className={orphans.has(item) ? 'bom-sheet-orphan' : undefined}>
                    <td className="bom-sheet-fixed">{names.get(item.documentId)}</td>
                    <th scope="row" className="bom-sheet-reference">
                      {item.label}
                    </th>
                    <td className="bom-sheet-fixed">{findLibraryItem(item.type)?.name ?? item.type}</td>
                    {columns.map((column) => (
                      <td key={column.key}>
                        <Cell
                          value={valueOf(item, column)}
                          label={`${item.label} ${column.title}`}
                          disabled={!applies(item, column.key)}
                          options={RATING_FIELDS[column.key]?.options}
                          onCommit={(value) => onEdit(item, column, value)}
                        />
                      </td>
                    ))}
                    <td className="bom-sheet-remove">
                      {orphans.has(item) && (
                        <button
                          type="button"
                          aria-label={`Remove ${item.label} from the BOM`}
                          title="This part is not in the circuits. Remove it from the BOM."
                          onClick={() => onRemove([item])}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="bom-sheet-none">No parts match the filter.</p>}
          </div>
        </>
      )}
    </main>
  )
}
