import { useEffect, useRef, useState } from 'react'
import { testCircuit } from '../../simulation/circuitTest.js'
import { formatQuantity } from '../../shared/siValue.js'
import { runSpice } from '../../simulation/spiceRun.js'
import '../../styles/buttons.css'
import '../../styles/dialog.css'
import './TestCircuitDialog.css'

const SEVERITY_ICON = { error: '✖', warning: '⚠', info: 'ℹ' }
const VERDICT_ICON = { pass: '✔', warn: '⚠', fail: '✖', blocked: '✖' }
const STATE_LABEL = { ok: 'OK', warn: 'Check', error: 'Problem' }

const volts = (value) => formatQuantity(value, 'V')
const amps = (value) => formatQuantity(value, 'A')
const watts = (value) => formatQuantity(value, 'W')
const show = (value, format) => (value === null || value === undefined ? '' : format(value))

// Simulates the circuit with ngspice and shows whether it works: a verdict, what is wrong, and every part's voltage,
// current and power. `getDiagram` reads the circuit as it is now, so Run again picks up edits made in between.
export default function TestCircuitDialog({ circuitName, getDiagram, onSelect, onClose }) {
  const [report, setReport] = useState(null)
  const [run, setRun] = useState(0)
  const [copied, setCopied] = useState(false)
  const latest = useRef(0)
  // The diagram is read when a run starts, not whenever the parent renders.
  const diagramSource = useRef(getDiagram)
  useEffect(() => {
    diagramSource.current = getDiagram
  })

  useEffect(() => {
    const id = (latest.current += 1)
    testCircuit(diagramSource.current(), { title: circuitName, simulate: runSpice }).then((result) => {
      if (id === latest.current) setReport(result)
    })
  }, [run, circuitName])

  // Escape closes the dialog wherever the focus is, not only when something inside it has it.
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const again = () => {
    setReport(null)
    setRun((count) => count + 1)
  }

  const copyNetlist = async () => {
    try {
      await navigator.clipboard.writeText(report.netlist)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.alert('Could not copy. Select the netlist text and copy it instead.')
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="import-dialog test-dialog" role="dialog" aria-modal="true" aria-labelledby="test-title">
        <h2 id="test-title">Test circuit</h2>
        <p className="test-subtitle">{circuitName} · DC operating point (the steady state once everything has settled), simulated locally with ngspice</p>
        {!report && (
          <p role="status" className="test-running">
            Running ngspice… the first run loads the simulator and can take a few seconds.
          </p>
        )}
        {report && (
          <>
            <div className={`test-verdict verdict-${report.verdict}`} role="status">
              <span aria-hidden="true">{VERDICT_ICON[report.verdict]}</span>
              <strong>{report.headline}</strong>
            </div>
            {report.findings.length > 0 && (
              <ul className="test-findings" aria-label="Findings">
                {report.findings.map((finding, index) => (
                  <li key={index} className={`finding-${finding.severity}`}>
                    <span aria-hidden="true">{SEVERITY_ICON[finding.severity]}</span>
                    <span>{finding.message}</span>
                    {finding.ids.length > 0 && (
                      <button type="button" className="finding-show" onClick={() => onSelect(finding.ids)}>
                        Show
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {report.parts.length > 0 && (
              <table className="test-table">
                <caption>Components</caption>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Value</th>
                    <th>Voltage</th>
                    <th>Current</th>
                    <th>Power</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.parts.map((part) => (
                    <tr key={part.id} className={`state-${part.state}`}>
                      <th scope="row">{part.label}</th>
                      <td>{part.value}</td>
                      <td>{show(part.voltage, volts)}</td>
                      <td>{show(part.current, amps)}</td>
                      <td>{show(part.power, watts)}</td>
                      <td>{part.state === 'ok' ? part.note || STATE_LABEL.ok : STATE_LABEL[part.state]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.nets.length > 0 && (
              <table className="test-table test-nets">
                <caption>Voltage at each net</caption>
                <thead>
                  <tr>
                    <th>Net</th>
                    <th>Voltage</th>
                  </tr>
                </thead>
                <tbody>
                  {report.nets.map((net) => (
                    <tr key={net.node}>
                      <th scope="row">{net.name}</th>
                      <td>{volts(net.voltage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <details className="test-details">
              <summary>SPICE netlist</summary>
              <p>This is standard SPICE, so you can also run it in ngspice or LTspice.</p>
              <pre>{report.netlist}</pre>
              <button type="button" className="reference-button" onClick={copyNetlist}>
                {copied ? 'Copied' : 'Copy netlist'}
              </button>
            </details>
            {report.messages.length > 0 && (
              <details className="test-details">
                <summary>Messages from ngspice</summary>
                <pre>{report.messages.join('\n')}</pre>
              </details>
            )}
          </>
        )}
        <div className="import-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="export-button" onClick={again} disabled={!report}>
            Run again
          </button>
        </div>
      </section>
    </div>
  )
}
