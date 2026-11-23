import { useState } from 'react'
import { listRecentProjects } from '../../project/recentProjects.js'
import ContextMenu from '../editor/ContextMenu.jsx'
import Icon from '../ui/Icon.jsx'
import ProjectMenu from './ProjectMenu.jsx'
import '../../styles/buttons.css'
import '../../styles/indicators.css'
import './TopBar.css'

const SAVE_SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘S' : 'Ctrl+S'
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const sizeText = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export default function TopBar({ projectName, onProjectNameChange, onExport, onImport, onSaveProject, saveTitle, onBom, onTest, onNewCircuit, onClearCircuit, project }) {
  const [menu, setMenu] = useState(null)

  const openMenu = async (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const left = event.currentTarget.parentElement.getBoundingClientRect().left
    let recent = []
    let recentError = ''
    try {
      recent = await listRecentProjects()
    } catch (error) {
      recentError = error.message
    }
    setMenu({ x: left, y: box.bottom + 6, recent, recentError })
  }

  const rename = () => {
    const input = document.getElementById('project-name')
    input.focus()
    input.select()
  }

  const recentItems = (menu) => {
    if (menu.recentError) return []
    const entries = menu.recent.map((entry) => ({
      key: `recent-${entry.key}`,
      label: entry.name,
      detail: `${dateFormat.format(entry.savedAt)} · ${sizeText(entry.size)}`,
      onSelect: () => project.onOpenRecent(entry),
    }))
    return entries.length
      ? [...entries, { key: 'recent-gap', separator: true }, { key: 'recent-clear', label: 'Clear recent projects', danger: true, onSelect: project.onClearRecent }]
      : []
  }

  const items = (menu) => [
    { key: 'new', label: 'New project', detail: 'The current one is kept under Open recent', onSelect: project.onNew },
    {
      key: 'open',
      label: 'Open project…',
      detail: 'A Live Wire .spark file',
      onSelect: () => (project.canOpenFiles ? project.onOpen() : document.getElementById('open-project-file').click()),
    },
    {
      key: 'recent',
      label: 'Open recent',
      children: recentItems(menu),
      emptyText: menu.recentError || 'Projects you save or open appear here',
    },
    { key: 'gap-1', separator: true },
    { key: 'rename', label: 'Rename…', onSelect: rename },
    { key: 'save', label: 'Save project', shortcut: SAVE_SHORTCUT, onSelect: onSaveProject },
    { key: 'save-as', label: 'Save as…', detail: 'Save to a new file', onSelect: project.onSaveAs },
  ]

  return (
    <header className="topbar">
      <div className="brand brand-wordmark" role="img" aria-label="Live Wire">
        <svg className="brand-lightning" viewBox="0 0 21 24" aria-hidden="true">
          <path d="M18 1H7L1 10l8 3-5 10h10l6-11-8-3z" />
        </svg>
        <span className="brand-name">Live Wire</span>
      </div>
      <div className="top-divider" />
      <div className="project-title">
        <span className="project-icon">
          <Icon name="grid" size={15} />
        </span>
        <input
          id="project-name"
          aria-label="Project name"
          value={projectName}
          onChange={(event) => onProjectNameChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.target.blur()}
        />
        <button type="button" className="project-menu-toggle" aria-label="Project actions" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={openMenu}>
          <Icon name="chevron" size={15} />
        </button>
        <input
          id="open-project-file"
          type="file"
          accept=".spark,application/json"
          hidden
          onChange={(event) => {
            const [file] = event.target.files
            event.target.value = ''
            if (file) project.onOpen(file)
          }}
        />
        {menu && <ContextMenu x={menu.x} y={menu.y} title="PROJECT" items={items(menu)} onClose={() => setMenu(null)} />}
      </div>
      <div className="top-actions">
        <span className="saved">
          <span /> Design workspace
        </span>
        <ProjectMenu onNewCircuit={onNewCircuit} onClearCircuit={onClearCircuit} />
        <button className="import-button" onClick={onImport}>
          Import
        </button>
        <button className="import-button" onClick={onBom} title="Show the bill of materials">
          BOM
        </button>
        <button className="import-button test-button" onClick={onTest} title="Simulate this circuit with ngspice and check that it works">
          ▶ Test circuit
        </button>
        <button className="import-button" onClick={onSaveProject} title={`${saveTitle} (${SAVE_SHORTCUT})`}>
          Save project
        </button>
        <button className="export-button" onClick={onExport}>
          <Icon name="download" size={16} /> Export <span className="export-extra">SVG</span>
        </button>
        <div className="avatar">LW</div>
      </div>
    </header>
  )
}
