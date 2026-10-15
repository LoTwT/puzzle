import { describe, expect, it } from 'vitest'

import { acceptsPointer, adjacentSlot, hitTestSlot, reachedDragThreshold } from './input'
import type { GridSize } from './types'

describe('输入坐标与边界', () => {
  it('小数坐标中的精确边线仍归右/下格，外缘仍被排除', () => {
    const bounds = { left: 16.25, top: 17.3, width: 123.123, height: 357.5 }
    for (const size of [3, 4, 5, 6] as const) {
      for (let edge = 1; edge < size; edge++) {
        const x = bounds.left + (bounds.width * edge) / size
        const y = bounds.top + (bounds.height * edge) / size
        expect(hitTestSlot(x, bounds.top, bounds, size)).toBe(edge)
        expect(hitTestSlot(bounds.left, y, bounds, size)).toBe(edge * size)
        expect(hitTestSlot(x - 0.000001, bounds.top, bounds, size)).toBe(edge - 1)
      }
      expect(hitTestSlot(bounds.left + bounds.width, bounds.top, bounds, size)).toBeNull()
      expect(hitTestSlot(bounds.left, bounds.top + bounds.height, bounds, size)).toBeNull()
    }
  })
  it.each([3, 4, 5, 6] as GridSize[])('%i 网格矩形内容区的所有交界属于右/下格', (size) => {
    for (const [width, height] of [
      [600, 120],
      [120, 600],
    ]) {
      const bounds = { left: 17, top: -43, width: width!, height: height! }
      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          const x = bounds.left + (column * bounds.width) / size
          const y = bounds.top + (row * bounds.height) / size
          expect(hitTestSlot(x, y, bounds, size)).toBe(row * size + column)
          expect(
            hitTestSlot(
              x + bounds.width / size - 0.001,
              y + bounds.height / size - 0.001,
              bounds,
              size,
            ),
          ).toBe(row * size + column)
        }
      }
      for (const [x, y] of [
        [16.99, -43],
        [17, -43.01],
        [17 + bounds.width, -43],
        [17, -43 + bounds.height],
        [-500, 900],
      ]) {
        expect(hitTestSlot(x!, y!, bounds, size)).toBeNull()
      }
    }
  })

  it('空内容区不命中，阈值使用 CSS 像素直线距离且包含 6px', () => {
    expect(hitTestSlot(0, 0, { left: 0, top: 0, width: 0, height: 10 }, 3)).toBeNull()
    expect(reachedDragThreshold(15.999, 20, 10, 20)).toBe(false)
    expect(reachedDragThreshold(16, 20, 10, 20)).toBe(true)
    expect(reachedDragThreshold(13, 24, 10, 20)).toBe(false)
    expect(reachedDragThreshold(13.6, 24.8, 10, 20)).toBe(true)
  })

  it.each([3, 4, 5, 6] as GridSize[])('%i 网格方向键停在边界且不跨行', (size) => {
    for (let slot = 0; slot < size * size; slot++) {
      expect(adjacentSlot(slot, 'ArrowLeft', size)).toBe(slot % size === 0 ? slot : slot - 1)
      expect(adjacentSlot(slot, 'ArrowRight', size)).toBe(
        slot % size === size - 1 ? slot : slot + 1,
      )
      expect(adjacentSlot(slot, 'ArrowUp', size)).toBe(slot < size ? slot : slot - size)
      expect(adjacentSlot(slot, 'ArrowDown', size)).toBe(
        slot >= size * (size - 1) ? slot : slot + size,
      )
    }
  })

  it('鼠标仅主键，触屏与笔仅主指针', () => {
    const event = {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
    }
    expect(acceptsPointer(event)).toBe(true)
    expect(acceptsPointer({ ...event, button: 1 })).toBe(false)
    expect(acceptsPointer({ ...event, button: 2 })).toBe(false)
    for (const pointerType of ['mouse', 'touch', 'pen']) {
      expect(acceptsPointer({ ...event, pointerType })).toBe(true)
      expect(acceptsPointer({ ...event, pointerType, isPrimary: false })).toBe(false)
    }
  })
})
