import { rearrangeDiagram } from './rearrange.js'

// Runs the rearranging off the page's thread, which it would otherwise hold for several seconds.
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: rearrangeDiagram(data.diagram) })
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
