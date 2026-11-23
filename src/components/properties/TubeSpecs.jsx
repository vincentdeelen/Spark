import { tubeSpecsFor } from '../../tubes/tubeData.js'

export default function TubeSpecs({ component }) {
  const specs = tubeSpecsFor(component)
  if (!specs) return null
  return (
    <div className="property-section tube-specs">
      <div className="section-label">TUBE CHARACTERISTICS</div>
      <p className="property-help">
        <strong>{specs.type.toUpperCase()}</strong> · {specs.family}
        {specs.section ? ' (split: this symbol is one of its two triodes)' : ''}
      </p>
      <table>
        <tbody>
          {specs.rows.map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{value}</td>
            </tr>
          ))}
          {specs.equivalents.length > 0 && (
            <tr>
              <th scope="row">Also known as</th>
              <td>{specs.equivalents.join(', ')}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="property-help">Typical values from manufacturer data sheets; they vary between makers and variants.</p>
    </div>
  )
}
