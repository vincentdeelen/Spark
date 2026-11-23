# Architecture

Live Wire is a React app, but most of its code is not React: the circuit model, the simulator, the importers and the file
formats are plain JavaScript modules that run (and are tested) without a browser. The folders under `src/` are layers, and
**a layer may import from the layers below it, never from the ones above**. `npm run lint` enforces this
(see `eslint.config.js`), so a wrong dependency fails the build instead of creeping in.

```
App.jsx, main.jsx        the application shell: owns the sheets, views and BOM, and wires the pieces together
components/              React UI (layout/, editor/, symbols/, library/, properties/, dialogs/, ui/)
hooks/                   React hooks (selection, undo history, project files, zoom…)
─────────────────────── nothing below imports React, components/ or hooks/ ───────────────────────
project/                 project files: save/open (.spark), the circuit file format, recent projects, SVG export, sheet operations
importing/               bringing circuits in: PDF/image/SVG import, OCR, wire and symbol detection, learned corrections
bom/                     bill of materials: parsing, matching to components, detecting parts from a BOM, keeping it in step with the circuits (bomSync.js)
simulation/              the test: netlist from a drawing, ngspice run, and the judging of results
circuit/                 the core model: parts, wires, geometry, edits (diagramOps), connections, ratings
tubes/                   tube types, their equivalent names and characteristics
shared/                  ids, grid, zoom limits, file-size limits (imports nothing)
```

Enforced rules: `shared` imports nothing; `tubes` only `shared`; `circuit` only `shared` and `tubes`; `simulation` only those
three; `bom`, `importing` and `project` must not import React code. (`bom` and `importing` do use each other: finding a BOM in
a scanned PDF needs OCR, and importing a PDF looks for its BOM.)

## The circuit model (`circuit/`)

A circuit (a *diagram*) is `{ components, wires, reference?, viewRegion? }`: plain objects with no behaviour, so they can be
saved, compared and undone by copying. Everything that changes one is a pure function from a diagram to a new diagram
(`diagramOps.js`, `connections.js`, `wireFollow.js`, `wireMarkers.js`, `ribbon.js`).

- `library.js` is the catalogue of parts the toolbox offers; `ratings.js` the characteristics a part can carry besides its value.
- **`partGeometry.js` is the single source of truth for where a part's terminals and body are.** Wires, connection dots, wires
  following a moved part, the canvas selection box and the simulator all read terminals from `terminalsOf`. The numbers
  describe the symbols in `components/symbols`, so change a symbol and its entry there together.
- `geometry.js` is plane geometry on points (distance to a segment, clean-up of a wire) with no knowledge of circuits.
- `junctions.js` decides where a connection dot or a crossing hop is drawn; `canvasExtent.js` how far the canvas reaches.
- **Layout** (tidying a crowded circuit): `labelLayout.js` places component labels (a label's place is `component.labelPlacement`,
  default from `defaultLabelPlacement`); `rearrange.js` moves components to reduce crossings. Rearranging is split into
  `rearrangeModel.js` (the circuit as pieces of wire between nodes, nets, and `connectionSignature`, the check that nothing was
  connected or disconnected), `rearrangeSearch.js` (simulated annealing on the real wiring) and `wireRouting.js` (drawing a wire
  again as horizontal and vertical runs). `rects.js` has the rectangle tests they share, and `partGeometry.bodyRectOf` /
  `areaRectOf` the room a symbol takes. `rearrange.worker.js` runs it off the page's thread (`components/editor/rearrangeInWorker.js`).

## The simulator (`simulation/`)

`spiceNetlist.js` turns a diagram into SPICE text (nets from the geometry, models per part, checks that need no simulator),
`spiceRun.js` runs it in ngspice (WebAssembly, loaded on first use), and `circuitTest.js` judges the numbers that come back
against what each part can take. Adding a simulated part means a terminal shape in `partGeometry.js`, a `kind` and an
emission in `spiceNetlist.js`, and a judgment in `circuitTest.js`.

## The editor (`components/editor`)

`SheetEditor` is one circuit's workspace. It holds the editor state and handlers; what can be decided without state lives
elsewhere: pure edits in `circuit/diagramOps.js`, and the right-click menus in `editor/menuModels.js`, which take the circuit
and a set of actions and return menu entries (so they are tested without React). `App.jsx` owns the list of sheets; saving and
opening live in `hooks/useProjectFiles.js`.

## Conventions

- Tests sit beside the code they test (`x.js` and `x.test.js`) and run with `npm test`.
- Prefer a pure function in a domain layer over logic in a component. If a component handler grows a decision, move the
  decision out and test it.
- `window.confirm` and `window.alert` are used for blocking questions; keep them in components and hooks, never in domain code.
- Known large spots: `components/dialogs/TrainingDialog.jsx` (the Teach & review tool) is one big component with its detection
  pipeline inline, and `SheetEditor` still holds the pointer-drag handlers. Split them along the same lines when next touching them.
