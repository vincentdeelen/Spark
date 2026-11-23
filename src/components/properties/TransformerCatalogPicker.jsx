import { TRANSFORMER_CATALOG, catalogName, findCatalogEntry } from '../../circuit/transformerCatalog.js'
import { isTransformer } from '../../circuit/transformers.js'

// Switches a transformer to a known part, filling in its kind, value and characteristics from the catalog.
export default function TransformerCatalogPicker({ component, onApply }) {
  if (!isTransformer(component.type)) return null
  const current = findCatalogEntry(component.value)
  return (
    <label>
      Known transformer
      <select
        value={current?.id ?? ''}
        onChange={(event) => {
          const entry = TRANSFORMER_CATALOG.find((item) => item.id === event.target.value)
          if (entry) onApply(entry)
        }}
      >
        <option value="" disabled>
          Choose a part to fill in its details…
        </option>
        {TRANSFORMER_CATALOG.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {catalogName(entry)} · {entry.title}
          </option>
        ))}
      </select>
    </label>
  )
}
