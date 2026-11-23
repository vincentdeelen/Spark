import { useCallback, useEffect, useRef, useState } from 'react'

// A transient status message; showing a new one replaces the old one and restarts the timer.
export default function useNotice(duration = 4000) {
  const [notice, setNotice] = useState('')
  const timer = useRef(null)
  const show = useCallback(
    (message) => {
      window.clearTimeout(timer.current)
      setNotice(message)
      timer.current = window.setTimeout(() => setNotice(''), duration)
    },
    [duration],
  )
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [notice, show]
}
