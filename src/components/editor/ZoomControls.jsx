import Icon from '../ui/Icon.jsx'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, zoomIn, zoomOut } from '../../shared/zoom.js'
import '../../styles/canvas-controls.css'

export default function ZoomControls({ zoom, onZoomChange }) {
  return (
    <div className="zoom-controls">
      <button type="button" onClick={() => onZoomChange(zoomOut)} disabled={zoom <= MIN_ZOOM} title="Zoom out" aria-label="Zoom out">
        <Icon name="minus" size={15} />
      </button>
      <span>{zoom}%</span>
      <button type="button" onClick={() => onZoomChange(zoomIn)} disabled={zoom >= MAX_ZOOM} title="Zoom in" aria-label="Zoom in">
        <Icon name="plus" size={15} />
      </button>
      <i />
      <button type="button" onClick={() => onZoomChange(DEFAULT_ZOOM)} title="Reset zoom" aria-label="Reset zoom">
        <Icon name="fit" size={15} />
      </button>
    </div>
  )
}
