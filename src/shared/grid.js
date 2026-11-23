export const GRID_SIZE = 10

export const snapToGrid = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE
