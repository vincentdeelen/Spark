import Icon from '../ui/Icon.jsx'
import '../../styles/indicators.css'
import '../../styles/canvas-controls.css'
import './CanvasToolbar.css'

function ToolButton({ icon, label, title = label, selected, ...props }) {
  return (
    <button className={`tool-button ${selected ? 'selected' : ''}`} title={title} aria-label={label} {...props}>
      <Icon name={icon} />
    </button>
  )
}

export default function CanvasToolbar({
  projectName,
  tool,
  multiSelect,
  canUndo,
  canRedo,
  canTidy,
  onToolChange,
  onMultiSelectChange,
  onUndo,
  onRedo,
  onOptimizeLabels,
  onRearrange,
}) {
  return (
    <div className="canvas-topbar">
      <div className="canvas-name">
        <span className="file-icon">⌁</span>
        <div>
          <strong>{projectName || 'Untitled circuit'}</strong>
          <small>SCHEMATIC DIAGRAM</small>
        </div>
      </div>
      <div className="canvas-tools">
        <ToolButton icon="pointer" label="Select" title="Select (V)" selected={tool === 'select' && !multiSelect} onClick={() => onToolChange('select')} />
        <ToolButton icon="grid" label="Select multiple components" selected={multiSelect} aria-pressed={multiSelect} onClick={onMultiSelectChange} />
        <ToolButton icon="wire" label="Draw wire" title="Draw wire (W)" selected={tool === 'wire'} onClick={() => onToolChange('wire')} />
        <ToolButton icon="fit" label="Create linked section" selected={tool === 'section'} onClick={() => onToolChange('section')} />
        <span className="tool-divider" />
        <ToolButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
        <ToolButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />
        <span className="tool-divider" />
        <ToolButton
          icon="labels"
          label="Optimize labels"
          title="Optimize labels: place every label next to its component, clear of everything else"
          onClick={onOptimizeLabels}
          disabled={!canTidy}
        />
        <ToolButton
          icon="arrange"
          label="Rearrange components"
          title="Rearrange components: move them to cross fewer wires, then keep or revert the result"
          onClick={onRearrange}
          disabled={!canTidy}
        />
      </div>
      <div className="canvas-status">
        <span /> Ready to design
      </div>
    </div>
  )
}
