// Runs a SPICE netlist in ngspice, compiled to WebAssembly (the eecircuit-engine package), entirely in the browser.
// The engine is large, so it is only loaded when a circuit is first tested.

const POLL_MS = 50
const DEFAULT_TIMEOUT_MS = 20000
// What ngspice prints when it gives up on a circuit. It then never finishes the run, so the run is abandoned.
const FAILED = /run simulation\(s\) aborted|could not be simulated|Error: /

let engine = null

async function startEngine() {
  const { Simulation } = await import('eecircuit-engine')
  const simulation = new Simulation()
  await simulation.start()
  return simulation
}

// ngspice's own messages without blank lines and notes; the last few are the most useful.
export const engineMessages = (messages) => messages.map((line) => line.trim()).filter(Boolean)

// Simulates `netlist` and returns { vectors, messages }: `vectors` maps each result name (lower case, e.g. "v(n1)" or
// "i(@d1[id])") to its value, `messages` are warnings from ngspice. Rejects with an Error whose `messages` hold ngspice's
// complaints when the circuit cannot be solved.
export async function runSpice(netlist, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  engine ??= startEngine()
  let simulation
  try {
    simulation = await engine
  } catch (error) {
    engine = null
    throw new Error(`The circuit simulator could not be started: ${error.message}`, { cause: error })
  }
  simulation.setNetList(netlist)
  let timer
  const failure = (reason) => Object.assign(new Error(reason), { messages: engineMessages(simulation.getError()) })
  try {
    const result = await Promise.race([
      simulation.runSim(),
      new Promise((_, reject) => {
        const started = Date.now()
        timer = setInterval(() => {
          const messages = simulation.getError().join('\n')
          if (FAILED.test(messages)) reject(failure('ngspice could not solve this circuit.'))
          else if (Date.now() - started > timeoutMs) reject(failure('The simulation took too long and was stopped.'))
        }, POLL_MS)
      }),
    ])
    return { vectors: Object.fromEntries(result.data.map((item) => [item.name.toLowerCase(), item.values[0]])), messages: engineMessages(simulation.getError()) }
  } catch (error) {
    // A run that failed leaves the engine waiting; start a fresh one next time.
    engine = null
    throw error.messages ? error : failure(error.message || 'The simulation failed.')
  } finally {
    clearInterval(timer)
  }
}
