import { findLibraryItem } from '../../circuit/library.js'
const PLACEMENT = {
  template: 'on a symbol matching your marked examples',
  learned: 'where your earlier assignments put symbols',
  label: 'at the label',
}

// Components proposed from BOM references found in the image. Trusted matches (exact, or an OCR misread you
// corrected before) can be added in bulk; other near matches must be confirmed one at a time.
export default function BomDetectionList({ detections, onShow, onAdd, onAddAll, onDismiss }) {
  const trustedCount = detections.filter((item) => item.trusted).length
  return (
    <div className="training-results">
      <div>
        <span>{detections.length} from BOM references · check each position and move it onto its symbol if needed</span>
        <button type="button" disabled={!trustedCount} onClick={onAddAll}>
          Add all trusted matches ({trustedCount})
        </button>
      </div>
      {detections.map((item, index) => (
        <div key={item.label}>
          <span>
            {item.label} · {findLibraryItem(item.type)?.name}
            {item.trusted ? '' : ` · near match for OCR "${item.text}"`} · {PLACEMENT[item.placement]} · confidence {Math.round(item.confidence)}%
          </span>
          <button type="button" onClick={() => onShow(index)}>
            Show
          </button>
          <button type="button" onClick={() => onAdd(index)}>
            Add
          </button>
          <button type="button" onClick={() => onDismiss(index)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
