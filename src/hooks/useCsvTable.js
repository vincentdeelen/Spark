import { useState } from 'react'
import { parseCsv } from '../bom/bom.js'
import { rowsToEditableCsv } from '../bom/bomExtraction.js'

// CSV text is the source of truth so users can edit it either as a grid or as raw text.
export default function useCsvTable(initialText) {
  const [text, setText] = useState(initialText)
  let rows = []
  let error = ''
  try {
    rows = parseCsv(text)
  } catch (reason) {
    error = reason.message
  }
  const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0)
  const setRows = (next) => setText(rowsToEditableCsv(next))
  const setCell = (rowIndex, columnIndex, value) => {
    const next = rows.map((row) => [...row])
    while (next[rowIndex].length <= columnIndex) next[rowIndex].push('')
    next[rowIndex][columnIndex] = value
    setRows(next)
  }
  const addRow = () => setRows([...rows, Array(columnCount).fill('')])
  const addColumn = () => setRows(rows.map((row) => [...Array.from({ length: columnCount }, (_, column) => row[column] || ''), '']))
  const removeRow = (rowIndex) => setRows(rows.filter((_, index) => index !== rowIndex))
  return { text, setText, rows, error, columnCount, setRows, setCell, addRow, addColumn, removeRow }
}
