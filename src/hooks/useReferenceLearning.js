import { useCallback, useState } from 'react'
import { clearAssignments, emptyModel, learnReferenceModel, readAssignments, saveAssignment } from '../importing/referenceLearning.js'

function load() {
  try {
    return { model: learnReferenceModel(readAssignments()), error: '' }
  } catch (reason) {
    return { model: emptyModel, error: reason.message }
  }
}

// What has been learned from BOM reference assignments, kept in sync with local storage.
export default function useReferenceLearning() {
  const [state, setState] = useState(load)
  const learn = useCallback((record) => {
    saveAssignment(record)
    setState(load())
  }, [])
  const clear = useCallback(() => {
    clearAssignments()
    setState({ model: emptyModel, error: '' })
  }, [])
  return { model: state.model, loadError: state.error, learn, clear }
}
