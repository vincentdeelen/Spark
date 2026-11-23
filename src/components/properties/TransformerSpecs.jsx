import { catalogName, findCatalogEntry } from '../../circuit/transformerCatalog.js'
import { transformerSpecs } from '../../circuit/transformers.js'

function Table({ rows }) {
  return (
    <table>
      <tbody>
        {rows.map(([name, value]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The windings of a transformer, what follows from the characteristics entered on it, and what is typical for its kind.
export default function TransformerSpecs({ component }) {
  const specs = transformerSpecs(component)
  if (!specs) return null
  const entry = findCatalogEntry(component.value)
  return (
    <div className="property-section transformer-specs">
      <div className="section-label">TRANSFORMER CHARACTERISTICS</div>
      <p className="property-help">
        <strong>{specs.title}</strong> · {specs.summary}
      </p>
      {entry && (
        <>
          <div className="spec-heading">
            {catalogName(entry)} · {entry.title}
          </div>
          <ul className="spec-notes">
            {entry.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {entry.source && (
            <p className="property-help">
              Source:{' '}
              <a href={entry.source} target="_blank" rel="noopener noreferrer">
                {new URL(entry.source).hostname}
              </a>
            </p>
          )}
        </>
      )}
      <div className="spec-heading">Windings</div>
      <Table rows={specs.windings} />
      {specs.derived.length > 0 && (
        <>
          <div className="spec-heading">From your values</div>
          <Table rows={specs.derived} />
        </>
      )}
      {specs.typical.length > 0 && (
        <>
          <div className="spec-heading">Typical values</div>
          <Table rows={specs.typical} />
          <p className="property-help">Typical figures for amplifier transformers; check the data sheet of yours.</p>
        </>
      )}
    </div>
  )
}
