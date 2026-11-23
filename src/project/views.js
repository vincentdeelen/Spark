// Display labels for the sheet selector; repeated names get a numeric suffix.
export function labelViews(views) {
  const counts = new Map()
  return views.map((view) => {
    const label = `${view.name}${view.section ? ' (linked section)' : ''}`
    const count = (counts.get(label) || 0) + 1
    counts.set(label, count)
    return { ...view, label: count > 1 ? `${label} (${count})` : label }
  })
}
