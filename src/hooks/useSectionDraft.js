import { useCallback, useState } from 'react'

// State for drawing a rectangular section: first corner, finished region awaiting a name, and feedback.
export default function useSectionDraft() {
  const [start, setStart] = useState(null)
  const [pending, setPending] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  // Forget an unfinished first corner but keep a region that is already awaiting its name.
  const abandonDrawing = useCallback(() => {
    setStart(null)
    setError('')
  }, [])
  const reset = useCallback(() => {
    setStart(null)
    setPending(null)
    setError('')
  }, [])
  const finishRegion = useCallback((region) => {
    setPending(region)
    setStart(null)
    setName('')
    setError('')
  }, [])

  return { start, pending, name, error, setStart, setName, setError, abandonDrawing, reset, finishRegion }
}
