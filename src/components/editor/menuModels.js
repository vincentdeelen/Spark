import { componentFamilies, rotationStep } from '../../circuit/library.js'
import { isTwoTerminal } from '../../circuit/partGeometry.js'
import { RIBBON_WIRE_COUNTS, isRibbon, pinsOf } from '../../circuit/ribbon.js'
import { attachedEnds } from '../../circuit/wireFollow.js'
import { WIRE_END_MARKERS, nearestWireEnd } from '../../circuit/wireMarkers.js'

// The entries of the editor's right-click menus (see ContextMenu for their shape), built from the circuit as it is now.
// They hold no state: everything they need comes in as `context` and every action goes out through `context.actions`.
//   menu         the open menu: { kind: 'component' | 'wire' | 'drop', id, point?, targetId? }
//   diagram      the circuit
//   selection    { ids, components, wires }, the selected items in the diagram
//   detachedIds  the components whose next move leaves their wires where they are
//   actions      removeSelected(), arrange(mode, ids?), startConnecting(mode, id), rotate(components, step),
//                changeSubtype(components, type), setRibbonWires(components, count), setWireEnd(wire, key, changes),
//                toggleDetach(component, detached)

const BLOCKED_HINT = 'Select components of one type to use this. A mixed selection can only be deleted.'
const CONNECT_HINT = 'Only two-terminal components (resistors, capacitors, diodes, fuses, inductors, sources, switches) can be connected in series or parallel.'

// Lets a component be moved away without its wires following; the wires stay where they are.
function detachItem({ diagram, detachedIds, actions }, components, many, blocked) {
  const [component] = components
  const wired = !many && component && Object.keys(attachedEnds(diagram, [component.id])).length > 0
  const detached = !many && component && detachedIds.has(component.id)
  return {
    key: 'detach',
    label: detached ? 'Keep attached to wires' : 'Detach from wires',
    disabled: many || (!wired && !detached),
    hint: many ? (blocked ? BLOCKED_HINT : 'Detach one component at a time.') : 'No wires end on this component.',
    onSelect: () => actions.toggleDetach(component, detached),
  }
}

// The off-page options for the wire end nearest to where the wire was right-clicked.
function wireEndItems({ menu, actions }, wire) {
  const key = nearestWireEnd(wire, menu.point || wire.points[0])
  const current = wire.ends?.[key] || {}
  return [
    {
      key: 'arrow',
      label: 'Arrow at this end',
      children: WIRE_END_MARKERS.map((marker) => ({
        key: marker.value || 'none',
        label: `${(current.marker || '') === marker.value ? '✓ ' : ''}${marker.label}`,
        onSelect: () => actions.setWireEnd(wire, key, { marker: marker.value }),
      })),
    },
    {
      key: 'end-label',
      label: current.label ? 'Edit end label…' : 'Label this end…',
      // The label is typed in the Properties panel, where the wire is now selected.
      onSelect: () => requestAnimationFrame(() => document.getElementById(`wire-end-label-${wire.id}-${key}`)?.focus()),
    },
  ]
}

// Menu for a part just placed on top of another: connect them in series or parallel, or leave them.
function dropMenu({ menu, diagram, actions }, placed) {
  const target = diagram.components.find((item) => item.id === menu.targetId)
  if (!target) return null
  const items = ['series', 'parallel'].map((mode) => ({
    key: mode,
    label: `Connect in ${mode} with ${target.label}`,
    onSelect: () => actions.arrange(mode, [target.id, placed.id]),
  }))
  return { title: `Connect ${placed.label}?`, items: [...items, { key: 'keep', label: 'Leave it unconnected', onSelect: () => {} }] }
}

// One item gets its own options. Several items of one component type share them. A mixed selection (different types, or
// wires with components) can only be deleted. Returns null when the item the menu was opened on no longer exists.
export function buildContextMenu(context) {
  const { menu, diagram, selection, actions } = context
  const target = diagram.components.find((item) => item.id === menu?.id) ?? diagram.wires.find((item) => item.id === menu?.id)
  if (!target) return null
  if (menu.kind === 'drop') return dropMenu(context, target)
  const items = selection.ids.length > 1 && selection.ids.includes(target.id) ? selection.components.length + selection.wires.length : 1
  const many = items > 1
  const remove = { key: 'delete', label: many ? 'Delete Selection' : menu.kind === 'wire' ? 'Delete wire' : 'Delete component', danger: true, onSelect: actions.removeSelected }
  if (menu.kind === 'wire' && !many) return { title: 'Wire', items: [...wireEndItems(context, target), remove] }
  const components = many ? selection.components : [target]
  const blocked = many && (selection.wires.length > 0 || !components.every((item) => item.type === components[0].type))
  const twoTerminal = components.every(isTwoTerminal)
  const hint = blocked ? BLOCKED_HINT : CONNECT_HINT
  const connect = (mode) => () => (many ? actions.arrange(mode) : actions.startConnecting(mode, target.id))
  const first = components[0]
  const subtypes = (componentFamilies.find((family) => family.subtypes.some((item) => item.type === first?.type))?.subtypes ?? []).filter((item) => item.type !== first?.type)
  return {
    title: many ? `${items} selected` : target.label,
    items: [
      { key: 'series', label: 'Connect in series', disabled: blocked || !twoTerminal, hint, onSelect: connect('series') },
      { key: 'parallel', label: 'Connect in parallel', disabled: blocked || !twoTerminal, hint, onSelect: connect('parallel') },
      { key: 'rotate', label: 'Rotate 90°', disabled: blocked, hint: BLOCKED_HINT, onSelect: () => actions.rotate(components, 90) },
      ...(first && rotationStep(first.type) === 45
        ? [{ key: 'rotate-45', label: 'Rotate 45°', disabled: blocked, hint: BLOCKED_HINT, onSelect: () => actions.rotate(components, 45) }]
        : []),
      subtypes.length && !blocked
        ? {
            key: 'subtype',
            label: 'Change subtype',
            children: subtypes.map((item) => ({ key: item.type, label: item.name, onSelect: () => actions.changeSubtype(components, item.type) })),
          }
        : { key: 'subtype', label: 'Change subtype', disabled: true, hint: blocked ? BLOCKED_HINT : 'This component has no other subtypes.' },
      ...(first && isRibbon(first.type) && !blocked
        ? [
            {
              key: 'wires',
              label: 'Number of wires',
              children: RIBBON_WIRE_COUNTS.map((count) => ({
                key: String(count),
                label: `${components.every((item) => pinsOf(item).length === count) ? '✓ ' : ''}${count} wires`,
                onSelect: () => actions.setRibbonWires(components, count),
              })),
            },
          ]
        : []),
      detachItem(context, components, many, blocked),
      remove,
    ],
  }
}
