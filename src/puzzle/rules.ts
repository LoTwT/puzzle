import { ASSISTED_RESERVED_FRACTION, GRID_SIZES, START_MODES } from './constants'
import type {
  GridSize,
  PuzzleConfig,
  PuzzleState,
  RandomSource,
  SlotIndex,
  StartMode,
  TileId,
} from './types'

export function isGridSize(value: unknown): value is GridSize {
  return GRID_SIZES.some((size) => size === value)
}

export function isStartMode(value: unknown): value is StartMode {
  return START_MODES.some((mode) => mode === value)
}

export function isValidPermutation(value: unknown, gridSize: GridSize): value is TileId[] {
  const total = gridSize * gridSize
  if (!Array.isArray(value) || value.length !== total) return false

  const seen = new Set<number>()
  for (const tile of value) {
    if (
      typeof tile !== 'number' ||
      !Number.isInteger(tile) ||
      tile < 0 ||
      tile >= total ||
      seen.has(tile)
    ) {
      return false
    }
    seen.add(tile)
  }
  return true
}

export function isValidPuzzleState(value: unknown): value is PuzzleState {
  if (typeof value !== 'object' || value === null) return false
  return (
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    value.sessionId.trim().length > 0 &&
    'gridSize' in value &&
    isGridSize(value.gridSize) &&
    'startMode' in value &&
    isStartMode(value.startMode) &&
    'tiles' in value &&
    isValidPermutation(value.tiles, value.gridSize) &&
    'moves' in value &&
    typeof value.moves === 'number' &&
    Number.isSafeInteger(value.moves) &&
    value.moves >= 0
  )
}

function shuffle(values: readonly number[], random: RandomSource): number[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const sample = random()
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('Random source must return a number in [0, 1).')
    }
    const otherIndex = Math.floor(sample * (index + 1))
    const tile = result[index]
    const otherTile = result[otherIndex]
    if (tile === undefined || otherTile === undefined)
      throw new Error('Cannot shuffle missing tiles.')
    result[index] = otherTile
    result[otherIndex] = tile
  }
  return result
}

export function createPuzzle(
  config: PuzzleConfig & { readonly sessionId: string },
  random: RandomSource = Math.random,
): PuzzleState {
  if (!isGridSize(config.gridSize) || !isStartMode(config.startMode) || !config.sessionId.trim()) {
    throw new RangeError('Invalid puzzle configuration.')
  }
  const positions = Array.from({ length: config.gridSize * config.gridSize }, (_, slot) => slot)
  const reserved = new Set(
    config.startMode === 'assisted'
      ? shuffle(positions, random).slice(
          0,
          Math.floor(positions.length * ASSISTED_RESERVED_FRACTION),
        )
      : [],
  )
  const mutableSlots = positions.filter((slot) => !reserved.has(slot))
  const shuffledTiles = shuffle(mutableSlots, random)
  const tiles = [...positions]
  mutableSlots.forEach((slot, index) => {
    const tile = shuffledTiles[index]
    if (tile === undefined) throw new Error('Missing shuffled tile.')
    tiles[slot] = tile
  })

  // 固定随机输入也必须终止；只动未预留的两格，保留辅助开局的承诺。
  if (isComplete(tiles)) {
    const [first, second] = mutableSlots
    if (first === undefined || second === undefined) throw new Error('Not enough mutable slots.')
    tiles[first] = second
    tiles[second] = first
  }

  return {
    sessionId: config.sessionId,
    gridSize: config.gridSize,
    startMode: config.startMode,
    tiles,
    moves: 0,
  }
}

export function isValidSlot(tiles: readonly TileId[], slot: SlotIndex): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < tiles.length
}

export function isSlotLocked(tiles: readonly TileId[], slot: SlotIndex): boolean {
  return isValidSlot(tiles, slot) && tiles[slot] === slot
}

export function getCorrectSlots(tiles: readonly TileId[]): SlotIndex[] {
  return tiles.flatMap((tile, slot) => (tile === slot ? [slot] : []))
}

export function isComplete(tiles: readonly TileId[]): boolean {
  return tiles.length > 0 && getCorrectSlots(tiles).length === tiles.length
}

export function canSwap(state: PuzzleState, sourceSlot: SlotIndex, targetSlot: SlotIndex): boolean {
  return (
    isValidPuzzleState(state) &&
    state.moves < Number.MAX_SAFE_INTEGER &&
    sourceSlot !== targetSlot &&
    isValidSlot(state.tiles, sourceSlot) &&
    isValidSlot(state.tiles, targetSlot) &&
    !isSlotLocked(state.tiles, sourceSlot) &&
    !isSlotLocked(state.tiles, targetSlot)
  )
}

/** 非法交换返回 null；有效交换产生新局面，永不修改调用者的排列。 */
export function applySwap(
  state: PuzzleState,
  sourceSlot: SlotIndex,
  targetSlot: SlotIndex,
): PuzzleState | null {
  if (!canSwap(state, sourceSlot, targetSlot)) return null
  const sourceTile = state.tiles[sourceSlot]
  const targetTile = state.tiles[targetSlot]
  if (sourceTile === undefined || targetTile === undefined) return null
  const tiles = [...state.tiles]
  tiles[sourceSlot] = targetTile
  tiles[targetSlot] = sourceTile
  return { ...state, tiles, moves: state.moves + 1 }
}
