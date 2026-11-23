import { useCallback, useState } from 'react'

// Which components and wires are selected. `selectedIds` holds every selected item (shift-click adds or removes one);
// `selected` is the primary one, the last picked, shown in the properties panel.
export default function useSelection() {
  const [selected, setSelected] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])

  const clear = useCallback(() => {
    setSelected(null)
    setSelectedIds([])
  }, [])
  const setItems = useCallback((ids) => {
    setSelectedIds(ids)
    setSelected(ids[ids.length - 1] || null)
  }, [])
  const selectComponent = useCallback((id) => setItems([id]), [setItems])
  const selectWire = selectComponent
  const toggle = useCallback((id) => setItems(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]), [selectedIds, setItems])
  const focusLast = useCallback(() => setSelected(selectedIds[selectedIds.length - 1] || null), [selectedIds])

  return { selected, selectedIds, clear, selectComponent, selectWire, setComponents: setItems, toggle, focusLast }
}
