import { useCallback, useEffect, useRef, useState } from 'react'

// OCR words of a reference image, read once with the local OCR engine (horizontal and vertical text) and then shared. Reading starts as soon as
// `enabled` is true so words are ready to click; `ensure()` returns them, waiting for the same read if it is still running.
export default function useReferenceWords(dataUrl, enabled) {
  const [state, setState] = useState({ dataUrl: null, words: null, error: '' })
  const readRef = useRef(null)

  const ensure = useCallback(() => {
    if (readRef.current?.dataUrl !== dataUrl) {
      const promise = (async () => {
        let worker
        try {
          const { createLocalOcr, recognizeWords } = await import('../importing/ocr.js')
          worker = await createLocalOcr()
          return await recognizeWords(worker, dataUrl)
        } finally {
          if (worker) await worker.terminate()
        }
      })().then(
        (words) => {
          setState({ dataUrl, words, error: '' })
          return words
        },
        (reason) => {
          readRef.current = null
          setState({ dataUrl, words: null, error: reason.message || 'Could not read the text in the image.' })
          throw reason
        },
      )
      readRef.current = { dataUrl, promise }
    }
    return readRef.current.promise
  }, [dataUrl])

  useEffect(() => {
    if (enabled) ensure().catch(() => {})
  }, [enabled, ensure])

  const current = state.dataUrl === dataUrl
  return { words: current ? state.words : null, error: current ? state.error : '', loading: enabled && !(current && (state.words || state.error)), ensure }
}
