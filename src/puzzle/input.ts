import { DRAG_THRESHOLD_PX } from './constants'
import type { BoardBounds, GridSize, PointerInput, SlotIndex } from './types'

export function acceptsPointer(event: PointerInput): boolean {
  return event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0)
}

export function reachedDragThreshold(x: number, y: number, startX: number, startY: number) {
  return Math.hypot(x - startX, y - startY) >= DRAG_THRESHOLD_PX
}

/** 左上含、右下不含；分隔线归右/下格，宽高分别计算。 */
export function hitTestSlot(
  x: number,
  y: number,
  bounds: BoardBounds,
  size: GridSize,
): SlotIndex | null {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < bounds.left ||
    y < bounds.top ||
    x >= bounds.left + bounds.width ||
    y >= bounds.top + bounds.height
  )
    return null
  // 直接比较视口边线，避免先减起点再除格宽的舍入把精确边线归给左/上格。
  let row = 0
  let column = 0
  for (let edge = 1; edge < size; edge++) {
    if (x >= bounds.left + (bounds.width * edge) / size) column = edge
    if (y >= bounds.top + (bounds.height * edge) / size) row = edge
  }
  return row * size + column
}

export function adjacentSlot(slot: SlotIndex, key: string, size: GridSize): SlotIndex {
  const row = Math.floor(slot / size)
  const column = slot % size
  if (key === 'ArrowLeft' && column > 0) return slot - 1
  if (key === 'ArrowRight' && column < size - 1) return slot + 1
  if (key === 'ArrowUp' && row > 0) return slot - size
  if (key === 'ArrowDown' && row < size - 1) return slot + size
  return slot
}
