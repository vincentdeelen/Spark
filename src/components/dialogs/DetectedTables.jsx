export default function DetectedTables({ candidates, candidateId, busy, merge, onSelect, onDismiss, onMergeChange }) {
  return (
    <>
      <p>
        Possible BOM tables were found in the imported document. Review the extracted text and choose the correct circuit; detection and OCR can be wrong. Other candidates remain
        available when you reopen BOM.
      </p>
      <label>
        Detected table{' '}
        <select value={candidateId} disabled={busy} onChange={(event) => onSelect(event.target.value)}>
          <option value="">Other table or file</option>
          {candidates.map((candidate) => (
            <option value={candidate.id} key={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      {candidateId && (
        <button type="button" disabled={busy} onClick={onDismiss}>
          Dismiss detected table
        </button>
      )}
      {candidateId && (
        <label>
          <input type="checkbox" checked={merge} onChange={(event) => onMergeChange(event.target.checked)} disabled={busy} /> Add these rows to the existing BOM instead of
          replacing that circuit&apos;s entries
        </label>
      )}
    </>
  )
}
