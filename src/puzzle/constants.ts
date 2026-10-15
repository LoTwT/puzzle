export const GRID_SIZES = [3, 4, 5, 6] as const
export const START_MODES = ['assisted', 'random'] as const

export const DEFAULT_GRID_SIZE = 4
export const DEFAULT_START_MODE = 'assisted'
export const ASSISTED_RESERVED_FRACTION = 1 / 4
export const DRAG_THRESHOLD_PX = 6

export const MOTION = {
  enter: 160,
  pickup: 90,
  swap: 180,
  return: 160,
  correct: 500,
  complete: 800,
  original: 120,
  pickupScale: 1.04,
  moveEasing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  opacityEasing: 'linear',
} as const

export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 20_000_000
export const MAX_IMAGE_EDGE = 2048
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
