// Runs rearrangeDiagram in a worker, so the page stays usable while the search runs. Resolves with its result.
export function rearrangeInWorker(diagram) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../circuit/rearrange.worker.js', import.meta.url), { type: 'module' })
    const finish = (settle) => (value) => {
      worker.terminate()
      settle(value)
    }
    worker.onmessage = ({ data }) => (data.error ? finish(reject)(new Error(data.error)) : finish(resolve)(data.result))
    worker.onerror = (event) => finish(reject)(new Error(event.message || 'The rearranging failed.'))
    worker.postMessage({ diagram })
  })
}
