import { useEffect, useRef, useState } from 'react'

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Decodes a reference image into pixel data and derives a stable id from its content, so training
// examples can be tied to the image they came from. `onLoad`/`onError` report progress to the caller.
export default function useReferenceImage(dataUrl, { onLoad, onError }) {
  const [state, setState] = useState(null)
  const callbacks = useRef({ onLoad, onError })
  useEffect(() => {
    callbacks.current = { onLoad, onError }
  })

  useEffect(() => {
    let active = true
    const source = new Image()
    source.onload = async () => {
      if (!active) return
      const canvas = document.createElement('canvas')
      canvas.width = source.naturalWidth
      canvas.height = source.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        callbacks.current.onError('Could not create an image canvas.')
        return
      }
      context.drawImage(source, 0, 0)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      callbacks.current.onLoad()
      try {
        const sourceId = await sha256Hex(dataUrl)
        if (active) setState({ reference: dataUrl, image, sourceId })
      } catch {
        if (!active) return
        setState({ reference: dataUrl, image, sourceId: '' })
        callbacks.current.onError('Could not identify this image for local training. Open Live Wire on localhost or HTTPS.')
      }
    }
    source.onerror = () => {
      if (active) callbacks.current.onError('Could not load the reference image.')
    }
    source.src = dataUrl
    return () => {
      active = false
    }
  }, [dataUrl])

  const ready = state?.reference === dataUrl
  return { image: ready ? state.image : null, sourceId: ready ? state.sourceId : '' }
}
