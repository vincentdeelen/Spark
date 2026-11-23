// The circuit a new project starts with.
export const initialDiagram = {
  components: [
    { id: 'v1', type: 'source', x: 200, y: 300, rotation: 90, label: 'V1', value: '5 V' },
    { id: 'r1', type: 'resistor', x: 440, y: 180, rotation: 0, label: 'R1', value: '1 kΩ' },
    { id: 'd1', type: 'led', x: 680, y: 300, rotation: 90, label: 'D1', value: 'LED' },
    { id: 'g1', type: 'ground', x: 440, y: 420, rotation: 0, label: 'GND', value: '' },
  ],
  wires: [
    {
      id: 'w1',
      points: [
        [200, 260],
        [200, 180],
        [400, 180],
      ],
    },
    {
      id: 'w2',
      points: [
        [480, 180],
        [680, 180],
        [680, 260],
      ],
    },
    {
      id: 'w3',
      points: [
        [680, 340],
        [680, 420],
        [200, 420],
        [200, 340],
      ],
    },
  ],
}
