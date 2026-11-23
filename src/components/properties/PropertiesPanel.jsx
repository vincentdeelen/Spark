import { useId, useState } from 'react'
import { RATING_FIELDS, ratingFields } from '../../circuit/ratings.js'
import { library, rotationStep } from '../../circuit/library.js'
import { symbolViewBox } from '../symbols/symbolViewBox.js'
import CircuitSymbol from '../symbols/CircuitSymbol.jsx'
import { MAX_SCALE, MIN_SCALE } from '../../shared/zoom.js'
import Icon from '../ui/Icon.jsx'
import TransformerCatalogPicker from './TransformerCatalogPicker.jsx'
import TransformerSpecs from './TransformerSpecs.jsx'
import TubeSpecs from './TubeSpecs.jsx'
import RibbonPinsEditor from './RibbonPinsEditor.jsx'
import { isRibbon, withRibbonPins } from '../../circuit/ribbon.js'
import { WIRE_END_MARKERS, WIRE_ENDS, withWireEnd } from '../../circuit/wireMarkers.js'
import '../../styles/panel.css'
import './PropertiesPanel.css'

// A text field that commits on every keystroke, or on blur/Enter when `deferred` (so a BOM conflict can be confirmed once).
// With `options` it is a choice list; with `suggestions` the text field offers common values.
function ComponentField({ label, value, placeholder, onCommit, deferred, options, required, suggestions }) {
  const [draft, setDraft] = useState(value)
  const listId = useId()
  if (options) {
    return (
      <label>
        {label}
        <select value={value} onChange={(event) => onCommit(event.target.value)}>
          {!required && <option value="">Not specified</option>}
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <label>
      {label}
      <input
        value={deferred ? draft : value}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        onChange={(event) => (deferred ? setDraft(event.target.value) : onCommit(event.target.value))}
        onBlur={() => {
          if (deferred && draft !== value && onCommit(draft) === false) setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>
      )}
    </label>
  )
}

const inPairs = (items) => Array.from({ length: Math.ceil(items.length / 2) }, (_, index) => items.slice(index * 2, index * 2 + 2))

export default function PropertiesPanel({
  selectedComponent,
  selectedComponents,
  selectedWire,
  selectedWires = [],
  onUpdateComponent,
  onUpdateWire,
  onApplyCatalog,
  onRemoveSelected,
  onArrange,
  canArrange,
  connectionError,
  bomItem,
  hasBom,
}) {
  return (
    <aside className="properties-panel">
      <div className="properties-heading">
        <div className="eyebrow">FINE-TUNE YOUR DESIGN</div>
        <h2>Properties</h2>
      </div>
      {selectedComponents.length + selectedWires.length > 1 ? (
        <div className="properties-content">
          <div className="selected-card">
            <div className="selected-symbol wire-symbol">
              <Icon name="grid" size={23} />
            </div>
            <div>
              <strong>
                {selectedComponents.length + selectedWires.length} {selectedWires.length ? 'items' : 'components'} selected
              </strong>
              <span>
                {[
                  ...selectedComponents.map((item) => item.label),
                  ...(selectedWires.length ? [`${selectedWires.length} ${selectedWires.length === 1 ? 'wire' : 'wires'}`] : []),
                ].join(', ')}
              </span>
            </div>
          </div>
          <div className="property-section">
            <div className="section-label">ARRANGE CONNECTIONS</div>
            <p className="property-help">
              {canArrange
                ? 'Reposition and rotate components in selection order. Existing connected wires will be replaced.'
                : 'Series and parallel require a selection of two-terminal components only. Remove wires and multi-terminal components from the selection.'}
            </p>
            <button className="secondary-button" disabled={!canArrange} onClick={() => onArrange('series')}>
              Connect in series
            </button>
            <button className="secondary-button" disabled={!canArrange} onClick={() => onArrange('parallel')}>
              Connect in parallel
            </button>
            {connectionError && (
              <p className="connection-error" role="alert">
                {connectionError}
              </p>
            )}
            <button className="delete-button" onClick={onRemoveSelected}>
              <Icon name="trash" size={16} /> Delete Selection
            </button>
          </div>
        </div>
      ) : selectedComponent ? (
        <div className="properties-content">
          <div className="selected-card">
            <div className="selected-symbol">
              <svg viewBox={symbolViewBox(selectedComponent.type, selectedComponent)}>
                <CircuitSymbol type={selectedComponent.type} speed={selectedComponent.speed} section={selectedComponent.section} pins={selectedComponent.pins} />
              </svg>
            </div>
            <div>
              <strong>{library.find((item) => item.type === selectedComponent.type)?.name}</strong>
              <span>Selected component</span>
            </div>
          </div>
          <div className="property-section">
            <div className="section-label">COMPONENT DETAILS</div>
            <TransformerCatalogPicker component={selectedComponent} onApply={onApplyCatalog} />
            <ComponentField
              deferred={hasBom}
              key={`${selectedComponent.id}-label-${hasBom ? selectedComponent.label : ''}`}
              label="Label"
              value={selectedComponent.label}
              onCommit={(value) => onUpdateComponent({ label: value })}
            />
            <ComponentField
              deferred={hasBom}
              key={`${selectedComponent.id}-value-${hasBom ? selectedComponent.value : ''}`}
              label="Value"
              value={selectedComponent.value}
              onCommit={(value) => onUpdateComponent({ value })}
            />
            {inPairs(ratingFields(selectedComponent.type)).map((pair) => (
              <div className="property-row" key={pair.join('-')}>
                {pair.map((field) => (
                  <ComponentField
                    deferred={hasBom}
                    key={`${selectedComponent.id}-${field}-${hasBom ? selectedComponent[field] : ''}`}
                    label={RATING_FIELDS[field].label}
                    value={selectedComponent[field] ?? ''}
                    placeholder={RATING_FIELDS[field].placeholder}
                    options={RATING_FIELDS[field].options}
                    required={RATING_FIELDS[field].required}
                    suggestions={RATING_FIELDS[field].suggestions}
                    onCommit={(value) => onUpdateComponent({ [field]: value })}
                  />
                ))}
              </div>
            ))}
            {bomItem && (
              <p className="property-help">
                BOM match: {bomItem.label}
                {bomItem.description ? ` · ${bomItem.description}` : ''}
              </p>
            )}
            <ComponentField
              deferred
              key={`${selectedComponent.id}-size-${selectedComponent.scale ?? 1}`}
              label="Size (% of standard symbol)"
              value={String(Math.round((selectedComponent.scale ?? 1) * 100))}
              onCommit={(text) => {
                const percent = Number(text)
                if (!Number.isFinite(percent) || percent < MIN_SCALE * 100 || percent > MAX_SCALE * 100) return false
                return onUpdateComponent({ scale: percent / 100 })
              }}
            />
            <div className="property-row">
              <label>
                Position X<input value={selectedComponent.x} readOnly />
              </label>
              <label>
                Position Y<input value={selectedComponent.y} readOnly />
              </label>
            </div>
            <button className="secondary-button" onClick={() => onUpdateComponent({ rotation: (selectedComponent.rotation + 90) % 360 })}>
              <Icon name="rotate" size={16} /> Rotate 90°
            </button>
            {rotationStep(selectedComponent.type) === 45 && (
              <button className="secondary-button" onClick={() => onUpdateComponent({ rotation: (selectedComponent.rotation + 45) % 360 })}>
                <Icon name="rotate" size={16} /> Rotate 45°
              </button>
            )}
            <button className="delete-button" onClick={onRemoveSelected}>
              <Icon name="trash" size={16} /> Delete component
            </button>
          </div>
        </div>
      ) : selectedWire ? (
        <div className="properties-content">
          <div className="selected-card">
            <div className="selected-symbol wire-symbol">
              <Icon name="wire" size={23} />
            </div>
            <div>
              <strong>Wire</strong>
              <span>Selected connection</span>
            </div>
          </div>
          <div className="property-section">
            <label>
              Label
              <input value={selectedWire.label || ''} onChange={(event) => onUpdateWire({ label: event.target.value })} />
            </label>
            <p className="property-help">A label is visual only; it does not create an electrical net.</p>
            {WIRE_ENDS.map((key) => {
              const point = key === 'start' ? selectedWire.points[0] : selectedWire.points[selectedWire.points.length - 1]
              const end = selectedWire.ends?.[key] || {}
              const change = (changes) => onUpdateWire({ ends: withWireEnd(selectedWire, key, changes).ends })
              return (
                <div className="wire-end-fields" key={key}>
                  <div className="section-label">
                    {key === 'start' ? 'START' : 'END'} AT {point[0]}, {point[1]}
                  </div>
                  <label>
                    Arrow
                    <select value={end.marker || ''} onChange={(event) => change({ marker: event.target.value })}>
                      {WIRE_END_MARKERS.map((marker) => (
                        <option key={marker.value} value={marker.value}>
                          {marker.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    End label
                    <input
                      id={`wire-end-label-${selectedWire.id}-${key}`}
                      value={end.label || ''}
                      placeholder="e.g. B+ to sheet 2"
                      onChange={(event) => change({ label: event.target.value })}
                    />
                  </label>
                </div>
              )
            })}
            <p className="property-help">Mark where a wire continues on another sheet with an arrow and a label. Right-click near a wire end for the same options.</p>
            <button className="delete-button" onClick={onRemoveSelected}>
              <Icon name="trash" size={16} /> Delete wire
            </button>
          </div>
        </div>
      ) : (
        <div className="properties-empty">
          <div className="empty-icon">
            <Icon name="pointer" size={24} />
          </div>
          <h3>Nothing selected</h3>
          <p>Select a component on the canvas to view and edit its properties. Shift-click or use multi-select to arrange multiple components.</p>
        </div>
      )}
      {selectedComponent && selectedComponents.length <= 1 && isRibbon(selectedComponent.type) && (
        <RibbonPinsEditor component={selectedComponent} onChange={(pins) => onUpdateComponent({ pins, value: withRibbonPins(selectedComponent, pins).value })} />
      )}
      {selectedComponent && selectedComponents.length <= 1 && <TubeSpecs component={selectedComponent} />}
      {selectedComponent && selectedComponents.length <= 1 && <TransformerSpecs component={selectedComponent} />}
      {selectedComponent && bomItem && Object.entries(bomItem.specifications || {}).some(([, value]) => value) && (
        <div className="property-section">
          <div className="section-label">BOM SPECIFICATIONS</div>
          {Object.entries(bomItem.specifications)
            .filter(([, value]) => value)
            .map(([name, value]) => (
              <p className="property-help" key={name}>
                <strong>{name}:</strong> {value}
              </p>
            ))}
        </div>
      )}
      <div className="shortcuts">
        <div className="section-label">QUICK SHORTCUTS</div>
        <div>
          <span>Select tool</span>
          <kbd>V</kbd>
        </div>
        <div>
          <span>Wire tool</span>
          <kbd>W</kbd>
        </div>
        <div>
          <span>Undo</span>
          <kbd>⌘ Z</kbd>
        </div>
        <div>
          <span>Delete selected</span>
          <kbd>⌫</kbd>
        </div>
      </div>
    </aside>
  )
}
