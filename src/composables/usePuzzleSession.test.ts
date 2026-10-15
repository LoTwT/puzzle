import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { loadBuiltinImage } from '../puzzle/images'
import type { PuzzleImageResource, PuzzleState } from '../puzzle/types'
import { usePuzzleSession } from './usePuzzleSession'

vi.mock('../puzzle/images', () => ({
  GEOMETRY_IMAGE: { id: 'geometry' },
  loadBuiltinImage: vi.fn<typeof loadBuiltinImage>(),
}))

const scopes: ReturnType<typeof effectScope>[] = []
let resource: PuzzleImageResource

function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const session = scope.run(usePuzzleSession)
  if (!session) throw new Error('Missing session scope.')
  return { session, scope }
}

function currentState(session: ReturnType<typeof usePuzzleSession>): PuzzleState {
  const state = session.state.value
  if (!state) throw new Error('Missing puzzle state.')
  return state
}

function unlockedPair(state: PuzzleState): [number, number] {
  const slots = state.tiles.flatMap((tile, slot) => (tile !== slot ? [slot] : []))
  const [first, second] = slots
  if (first === undefined || second === undefined) throw new Error('Expected two unlocked slots.')
  return [first, second]
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  resource = {
    image: {
      id: 'geometry',
      source: 'builtin',
      displayName: '彩色几何',
      assetVersion: 1,
      blob: new Blob(),
      width: 1440,
      height: 1080,
    },
    url: 'blob:test',
    release: vi.fn<() => void>(),
  }
  vi.mocked(loadBuiltinImage).mockResolvedValue(resource)
})

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
})

describe('会话提交与点选', () => {
  it('默认 4×4 辅助开局；重复交换请求只提交一次', async () => {
    const { session } = setup()
    await session.loadInitialImage()
    const state = currentState(session)
    expect(state.gridSize).toBe(4)
    expect(state.startMode).toBe('assisted')
    const [sourceSlot, targetSlot] = unlockedPair(state)
    const request = { sessionId: state.sessionId, expectedMoves: 0, sourceSlot, targetSlot }
    expect(session.commitSwap(request)).toBe(true)
    const submitted = currentState(session)
    expect(session.commitSwap(request)).toBe(false)
    expect(session.state.value).toBe(submitted)
    expect(submitted.moves).toBe(1)
  })

  it('再点同格取消，点锁定格保留选择，点第二个可用格只交换一次', async () => {
    const { session } = setup()
    await session.loadInitialImage()
    const state = currentState(session)
    const [first, second] = unlockedPair(state)
    session.selectSlot(first, state.sessionId)
    session.selectSlot(first, state.sessionId)
    expect(session.selectedSlot.value).toBeNull()
    expect(session.state.value).toBe(state)
    session.selectSlot(first, state.sessionId)
    session.selectSlot(1, state.sessionId)
    session.selectSlot(-1, state.sessionId)
    expect(session.selectedSlot.value).toBe(first)
    expect(session.state.value).toBe(state)
    session.selectSlot(second, state.sessionId)
    expect(session.selectedSlot.value).toBeNull()
    expect(session.state.value?.moves).toBe(1)
  })

  it('无步数直接重开；旧会话事件不能修改新局', async () => {
    const { session } = setup()
    await session.loadInitialImage()
    const previous = currentState(session)
    session.requestRestart()
    const next = currentState(session)
    expect(next.sessionId).not.toBe(previous.sessionId)
    expect(session.restartConfirmationOpen.value).toBe(false)
    expect(
      session.commitSwap({
        sessionId: previous.sessionId,
        expectedMoves: 0,
        sourceSlot: 0,
        targetSlot: 5,
      }),
    ).toBe(false)
    session.selectSlot(0, previous.sessionId)
    expect(session.selectedSlot.value).toBeNull()
    expect(session.state.value).toBe(next)
    expect(next.moves).toBe(0)
    expect(session.imageResource.value).toBe(resource)
  })

  it('未完成且走过步才确认；取消保留排列、计数与选择，确认后配置不变', async () => {
    const { session } = setup()
    await session.loadInitialImage()
    const initial = currentState(session)
    const [first, second] = unlockedPair(initial)
    session.selectSlot(first, initial.sessionId)
    session.selectSlot(second, initial.sessionId)
    const moved = currentState(session)
    const [sourceSlot, targetSlot] = unlockedPair(moved)
    session.selectSlot(sourceSlot, moved.sessionId)
    session.requestRestart()
    expect(session.restartConfirmationOpen.value).toBe(true)
    expect(
      session.commitSwap({ sessionId: moved.sessionId, expectedMoves: 1, sourceSlot, targetSlot }),
    ).toBe(false)
    session.cancelRestart()
    expect(session.state.value).toBe(moved)
    expect(session.selectedSlot.value).toBe(sourceSlot)
    session.requestRestart()
    session.confirmRestart()
    const restarted = currentState(session)
    expect(restarted.sessionId).not.toBe(moved.sessionId)
    expect(restarted.moves).toBe(0)
    expect(restarted.gridSize).toBe(moved.gridSize)
    expect(restarted.startMode).toBe(moved.startMode)
    expect(session.imageResource.value).toBe(resource)
    expect(resource.release).not.toHaveBeenCalled()
    expect(session.selectedSlot.value).toBeNull()
  })

  it('经点选完成后停止输入，直接再来一局', async () => {
    const { session } = setup()
    await session.loadInitialImage()
    let steps = 0
    while (!session.completed.value) {
      const state = currentState(session)
      const source = state.tiles.findIndex((tile, slot) => tile !== slot)
      const target = state.tiles[source]
      if (target === undefined || steps >= 16) throw new Error('Puzzle is stuck.')
      session.selectSlot(source, state.sessionId)
      session.selectSlot(target, state.sessionId)
      steps++
    }
    const solved = currentState(session)
    expect(solved.moves).toBe(steps)
    expect(session.canInteract.value).toBe(false)
    session.selectSlot(0, solved.sessionId)
    expect(session.state.value).toBe(solved)
    session.requestRestart()
    expect(session.restartConfirmationOpen.value).toBe(false)
    expect(session.completed.value).toBe(false)
    expect(session.canInteract.value).toBe(true)
    expect(session.state.value?.moves).toBe(0)
  })

  it('图片加载可重试，资源随会话作用域释放', async () => {
    vi.mocked(loadBuiltinImage).mockRejectedValueOnce(new Error('Network failure'))
    const { session, scope } = setup()
    await session.loadInitialImage()
    expect(session.loadError.value).toContain('请重试')
    expect(session.state.value).toBeNull()
    await session.loadInitialImage()
    expect(session.loadError.value).toBe('')
    expect(session.state.value).not.toBeNull()
    scope.stop()
    expect(resource.release).toHaveBeenCalledTimes(1)
  })

  it('卸载后才加载成功的图片立即释放，不创建局面', async () => {
    let resolveImage: ((value: PuzzleImageResource) => void) | undefined
    vi.mocked(loadBuiltinImage).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImage = resolve
      }),
    )
    const { session, scope } = setup()
    const pending = session.loadInitialImage()
    scope.stop()
    resolveImage?.(resource)
    await pending
    expect(resource.release).toHaveBeenCalledTimes(1)
    expect(session.state.value).toBeNull()
  })
})
