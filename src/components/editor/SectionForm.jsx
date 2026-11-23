import '../../styles/dialog.css'
import './SectionForm.css'

export default function SectionForm({ name, error, onNameChange, onCreate, onCancel }) {
  return (
    <div className="section-overlay">
      <form
        className="section-form"
        onSubmit={(event) => {
          event.preventDefault()
          onCreate()
        }}
      >
        <strong>Create linked section</strong>
        <p>
          Sections are selected manually; stage boundaries are not identified automatically. Edits and undo history are shared with the original. Wires crossing the boundary still
          belong to the whole circuit.
        </p>
        <label>
          Section name
          <input autoFocus maxLength={1000} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Preamp" />
        </label>
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        <div className="import-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="export-button">
            Create section
          </button>
        </div>
      </form>
    </div>
  )
}
