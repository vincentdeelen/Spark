import { useState } from 'react'
import '../../styles/buttons.css'
import '../../styles/dialog.css'

// Asks for a name, e.g. for Save as. Enter or the confirm button submits; Escape or Cancel closes it.
export default function NameDialog({ title, label, initialName, confirmLabel, onConfirm, onClose }) {
  const [name, setName] = useState(initialName)
  const submit = (event) => {
    event.preventDefault()
    if (name.trim()) onConfirm(name.trim())
  }
  return (
    <div className="dialog-backdrop" onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <form className="import-dialog name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" onSubmit={submit}>
        <h2 id="name-dialog-title">{title}</h2>
        <label className="import-file">
          {label}
          <input autoFocus value={name} maxLength={1000} onFocus={(event) => event.target.select()} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="import-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="export-button" disabled={!name.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
