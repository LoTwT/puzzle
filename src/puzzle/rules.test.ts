import { describe, expect, it } from 'vitest'

import { GRID_SIZES, START_MODES } from './constants'
import {
  applySwap,
  canSwap,
  createPuzzle,
  getCorrectSlots,
  isComplete,
  isGridSize,
  isSlotLocked,
  isStartMode,
  isValidPermutation,
  isValidPuzzleState,
} from './rules'
import type { GridSize, PuzzleState, RandomSource } from './types'

function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function stateWith(tiles: readonly number[], moves = 0): PuzzleState {
  return { sessionId: 'test-session', gridSize: 3, startMode: 'random', tiles, moves }
}

function sparseTiles(length: number): number[] {
  const tiles: number[] = []
  tiles.length = length
  return tiles
}

for (const gridSize of GRID_SIZES) {
  for (const startMode of START_MODES) {
    describe(`${gridSize}×${gridSize} ${startMode}`, () => {
      const config = { sessionId: 'generated', gridSize, startMode }
      const total = gridSize * gridSize
      const reservedCount = startMode === 'assisted' ? Math.floor(total / 4) : 0

      it.each([1, 42, 2026, 0xdeadbeef])('种子 %i 生成完整、可复现且非完成的局面', (seed) => {
        const state = createPuzzle(config, seededRandom(seed))
        expect(state).toEqual(createPuzzle(config, seededRandom(seed)))
        expect(isValidPuzzleState(state)).toBe(true)
        expect([...state.tiles].sort((a, b) => a - b)).toEqual(
          Array.from({ length: total }, (_, index) => index),
        )
        expect(state.moves).toBe(0)
        expect(getCorrectSlots(state.tiles).length).toBeGreaterThanOrEqual(reservedCount)
        expect(isComplete(state.tiles)).toBe(false)
      })

      it('全正确洗牌仅交换未预留的两格，并保留偶然归位', () => {
        const state = createPuzzle(config, () => 1 - Number.EPSILON)
        const expected = Array.from({ length: total }, (_, slot) => slot)
        expected[reservedCount] = reservedCount + 1
        expected[reservedCount + 1] = reservedCount
        expect(state.tiles).toEqual(expected)
        expect(getCorrectSlots(state.tiles)).toHaveLength(total - 2)
        expect(isComplete(state.tiles)).toBe(false)
        expect(applySwap(state, reservedCount, reservedCount + 1)?.tiles).toEqual(
          Array.from({ length: total }, (_, slot) => slot),
        )
      })

      it('固定零随机数选出非前缀的保留位置，并按 Fisher-Yates 洗牌', () => {
        const state = createPuzzle(config, () => 0)
        const reserved = Array.from({ length: reservedCount }, (_, index) => index + 1)
        const mutable = Array.from({ length: total }, (_, slot) => slot).filter(
          (slot) => !reserved.includes(slot),
        )
        const rotated = [...mutable.slice(1), mutable[0]]
        const expected = Array.from({ length: total }, (_, slot) => slot)
        mutable.forEach((slot, index) => {
          const tile = rotated[index]
          if (tile === undefined) throw new Error('Invalid test fixture.')
          expected[slot] = tile
        })
        expect(state.tiles).toEqual(expected)
        expect(getCorrectSlots(state.tiles)).toEqual(reserved)
        for (const slot of reserved) expect(isSlotLocked(state.tiles, slot)).toBe(true)
      })

      it.each([1, 42, 2026, 0xdeadbeef])(
        '种子 %i 的局面持续归位后可完成且锁定集合不减少',
        (seed) => {
          let state = createPuzzle(config, seededRandom(seed))
          let swaps = 0
          while (!isComplete(state.tiles)) {
            const source = state.tiles.findIndex((tile, slot) => tile !== slot)
            const target = state.tiles[source]
            if (target === undefined) throw new Error('Missing target.')
            const lockedBefore = getCorrectSlots(state.tiles)
            const before = state
            const next = applySwap(state, source, target)
            expect(next).not.toBeNull()
            if (!next) throw new Error('Generated board is stuck.')
            state = next
            swaps++
            expect(state.moves).toBe(swaps)
            expect(isValidPermutation(state.tiles, gridSize)).toBe(true)
            expect(getCorrectSlots(state.tiles).length).toBeGreaterThan(lockedBefore.length)
            for (const slot of lockedBefore) expect(isSlotLocked(state.tiles, slot)).toBe(true)
            const unaffectedSlots = Array.from({ length: total }, (_, slot) => slot).filter(
              (slot) => slot !== source && slot !== target,
            )
            for (const slot of unaffectedSlots) expect(state.tiles[slot]).toBe(before.tiles[slot])
            expect(swaps).toBeLessThan(total)
          }
          expect(getCorrectSlots(state.tiles)).toHaveLength(total)
          expect(applySwap(state, 0, 1)).toBeNull()
        },
      )
    })
  }
}

describe('交换与锁定', () => {
  it.each([
    { name: '零块归位', tiles: [1, 0, 3, 2, 4, 5, 6, 7, 8], source: 0, target: 2, gained: 0 },
    { name: '一块归位', tiles: [1, 2, 0, 3, 4, 5, 6, 7, 8], source: 0, target: 1, gained: 1 },
    { name: '两块归位', tiles: [1, 0, 3, 2, 4, 5, 6, 7, 8], source: 0, target: 1, gained: 2 },
  ])('$name 的有效交换只提交一次并保持原输入', ({ tiles, source, target, gained }) => {
    const originalTiles = Object.freeze([...tiles])
    const original = Object.freeze(stateWith(originalTiles, 7))
    const next = applySwap(original, source, target)
    expect(canSwap(original, source, target)).toBe(true)
    expect(next?.moves).toBe(8)
    expect(next?.tiles[source]).toBe(tiles[target])
    expect(next?.tiles[target]).toBe(tiles[source])
    expect(getCorrectSlots(next?.tiles ?? []).length).toBe(getCorrectSlots(tiles).length + gained)
    expect(original.tiles).toEqual(tiles)
    expect(original.moves).toBe(7)
  })

  it.each([
    [0, 0],
    [4, 0],
    [0, 4],
    [4, 5],
    [-1, 0],
    [0, -1],
    [9, 0],
    [0, 9],
    [0.5, 1],
    [1, 0.5],
    [NaN, 0],
    [0, Infinity],
  ])('拒绝非法格位 %s → %s，计数不变', (source, target) => {
    const state = stateWith([1, 0, 3, 2, 4, 5, 6, 7, 8], 3)
    expect(canSwap(state, source, target)).toBe(false)
    expect(applySwap(state, source, target)).toBeNull()
    expect(state.moves).toBe(3)
    expect(state.tiles).toEqual([1, 0, 3, 2, 4, 5, 6, 7, 8])
  })

  it('初始正确格立即锁定，越界和小数格不是锁定格', () => {
    const tiles = [1, 0, 2, 3, 4, 5, 6, 7, 8]
    expect(isSlotLocked(tiles, 2)).toBe(true)
    for (const slot of [-1, 9, 0.5, NaN]) expect(isSlotLocked(tiles, slot)).toBe(false)
    expect(isComplete([])).toBe(false)
    expect(isComplete(sparseTiles(9))).toBe(false)
  })

  it('拒绝损坏局面和无法精确递增的交换次数', () => {
    expect(applySwap(stateWith([1, 1, 2, 3, 4, 5, 6, 7, 8]), 0, 1)).toBeNull()
    expect(
      applySwap(stateWith([1, 0, 2, 3, 4, 5, 6, 7, 8], Number.MAX_SAFE_INTEGER), 0, 1),
    ).toBeNull()
  })
})

describe('局面校验', () => {
  it.each(GRID_SIZES)('%i 网格拒绝缺失、重复、越界和非整数编号', (gridSize) => {
    const tiles = Array.from({ length: gridSize * gridSize }, (_, index) => index)
    expect(isValidPermutation(tiles, gridSize)).toBe(true)
    for (const invalid of [
      tiles.slice(1),
      [...tiles, 0],
      sparseTiles(tiles.length),
      [1, ...tiles.slice(1)],
      [-1, ...tiles.slice(1)],
      [tiles.length, ...tiles.slice(1)],
      [0.5, ...tiles.slice(1)],
      ['0', ...tiles.slice(1)],
      [NaN, ...tiles.slice(1)],
      null,
      {},
    ]) {
      expect(isValidPermutation(invalid, gridSize)).toBe(false)
    }
  })

  it('只接受支持的网格、模式、会话标识与非负整数次数', () => {
    const valid = stateWith([1, 0, 2, 3, 4, 5, 6, 7, 8])
    expect(isValidPuzzleState(valid)).toBe(true)
    for (const gridSize of [0, 2, 7, 3.5, '4', null]) {
      expect(isGridSize(gridSize)).toBe(false)
      expect(isValidPuzzleState({ ...valid, gridSize })).toBe(false)
    }
    for (const startMode of ['', 'easy', 'Random', null]) {
      expect(isStartMode(startMode)).toBe(false)
      expect(isValidPuzzleState({ ...valid, startMode })).toBe(false)
    }
    for (const moves of [-1, 0.5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) {
      expect(isValidPuzzleState({ ...valid, moves })).toBe(false)
    }
    for (const sessionId of ['', ' ', 1, null])
      expect(isValidPuzzleState({ ...valid, sessionId })).toBe(false)
    for (const value of [null, {}, [], 'invalid', { ...valid, tiles: [0] }])
      expect(isValidPuzzleState(value)).toBe(false)
  })

  it.each([-0.1, 1, NaN, Infinity])('拒绝随机源的非法样本 %s', (sample) => {
    expect(() =>
      createPuzzle({ sessionId: 'random', gridSize: 3, startMode: 'random' }, () => sample),
    ).toThrow(RangeError)
  })

  it('开局配置也在运行时校验', () => {
    expect(() =>
      createPuzzle({ sessionId: 'invalid', gridSize: 2 as GridSize, startMode: 'random' }),
    ).toThrow(RangeError)
    expect(() => createPuzzle({ sessionId: '', gridSize: 3, startMode: 'random' })).toThrow(
      RangeError,
    )
  })
})
