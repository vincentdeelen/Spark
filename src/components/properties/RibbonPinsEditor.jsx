import { useState } from 'react'
import { MAX_RIBBON_WIRES, MIN_RIBBON_WIRES, pinLabel, pinsOf, renumberPins, resizePins, validPins } from '../../circuit/ribbon.js'

// A number field that commits on Enter or when it loses focus, and reverts when the number is not accepted.
function NumberField({ label, value, min, max, onCommit, prefix }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const number = Number(draft)
    if (!Number.isInteger(number) || number < min || number > max || onCommit(number) === false) setDraft(String(value))
  }
  return (
    <label className={prefix ? 'pin-field' : undefined}>
      {label}
      <span className="pin-input">
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </span>
    </label>
  )
}

// The wires of a ribbon cable: how many there are and the J number of each pin.
export default function RibbonPinsEditor({ component, onChange }) {
  const pins = pinsOf(component)
  const update = (next) => (validPins(next) ? onChange(next) : false)
  const duplicates = new Set(pins.filter((pin, index) => pins.indexOf(pin) !== index))
  return (
    <div className="property-section ribbon-pins">
      <div className="section-label">RIBBON WIRES</div>
      <div className="property-row">
        <NumberField
          key={`count-${component.id}-${pins.length}`}
          label="Number of wires"
          value={pins.length}
          min={MIN_RIBBON_WIRES}
          max={MAX_RIBBON_WIRES}
          onCommit={(count) => update(resizePins(pins, count))}
        />
        <NumberField
          key={`first-${component.id}-${pins[0]}`}
          label="Number from J"
          value={pins[0]}
          min={0}
          max={9999}
          onCommit={(first) => update(renumberPins(pins.length, first))}
        />
      </div>
      <div className="pin-grid">
        {pins.map((pin, index) => (
          <NumberField
            key={`${component.id}-${index}-${pin}`}
            label={`Wire ${index + 1}`}
            prefix="J"
            value={pin}
            min={0}
            max={9999}
            onCommit={(number) => update(pins.map((item, position) => (position === index ? number : item)))}
          />
        ))}
      </div>
      {duplicates.size > 0 && (
        <p className="property-help connection-error" role="alert">
          {[...duplicates].map(pinLabel).join(', ')} {duplicates.size > 1 ? 'are' : 'is'} used on more than one wire.
        </p>
      )}
      <p className="property-help">Each wire is labelled with its pin, J and a number. Both boards connect to the same pin.</p>
    </div>
  )
}
