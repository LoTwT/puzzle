export const GRID_SIZES = [3, 4, 5, 6] as const
export const START_MODES = ['assisted', 'random'] as const

export const DEFAULT_GRID_SIZE = 4
export const DEFAULT_START_MODE = 'assisted'
export const ASSISTED_RESERVED_FRACTION = 1 / 4
export const DRAG_THRESHOLD_PX = 6

export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 20_000_000
export const MAX_IMAGE_EDGE = 2048
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
