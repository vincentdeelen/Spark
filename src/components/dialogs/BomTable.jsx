import './BomTable.css'

export default function BomTable({ rows, columnCount, disabled, onCellChange, onRemoveRow }) {
  const [header, ...body] = rows
  const columns = Array.from({ length: columnCount }, (_, column) => column)
  return (
    <div className="bom-table-container">
      <table className="bom-table">
        <thead>
          <tr>
            <th>Row</th>
            {columns.map((column) => (
              <th key={column}>
                <input
                  aria-label={`Column ${column + 1} heading`}
                  value={header[column] || ''}
                  disabled={disabled}
                  onChange={(event) => onCellChange(0, column, event.target.value)}
                />
              </th>
            ))}
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          {body.map((row, index) => {
            const rowNumber = index + 2
            return (
              <tr key={index}>
                <td>{rowNumber}</td>
                {columns.map((column) => (
                  <td key={column}>
                    <input
                      aria-label={`Row ${rowNumber}, ${header[column] || `column ${column + 1}`}`}
                      value={row[column] || ''}
                      disabled={disabled}
                      onChange={(event) => onCellChange(index + 1, column, event.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" disabled={disabled} aria-label={`Remove row ${rowNumber}`} onClick={() => onRemoveRow(index + 1)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
