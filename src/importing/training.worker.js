import { findExamples } from './training.js'

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ suggestions: findExamples(data.image, data.examples, data.threshold) })
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
