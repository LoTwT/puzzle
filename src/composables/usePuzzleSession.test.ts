import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import {
  BUILTIN_IMAGES,
  createImageResource,
  ImagePreparationError,
  loadBuiltinImage,
  loadUploadedImage,
} from '../puzzle/images'
import { createPuzzleStorage } from '../puzzle/storage'
import type { PointerInput, PuzzleImageResource, PuzzleSave, PuzzleState } from '../puzzle/types'
import { usePuzzleSession } from './usePuzzleSession'

vi.mock('../puzzle/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../puzzle/images')>()),
  createImageResource: vi.fn<typeof createImageResource>(),
  loadBuiltinImage: vi.fn<typeof loadBuiltinImage>(),
  loadUploadedImage: vi.fn<typeof loadUploadedImage>(),
}))

vi.mock('../puzzle/storage', () => ({ createPuzzleStorage: vi.fn<typeof createPuzzleStorage>() }))
const storage = {
  read: vi.fn<() => Promise<unknown>>(),
  save: vi.fn<(snapshot: PuzzleSave) => Promise<void>>(),
  close: vi.fn<() => void>(),
}

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
  storage.read.mockReset().mockResolvedValue(undefined)
  storage.save.mockReset().mockResolvedValue(undefined)
  storage.close.mockReset()
  vi.mocked(createPuzzleStorage).mockReturnValue(storage)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  resource = {
    image: {
      id: 'geometry',
      source: 'builtin',
      displayName: '彩色几何',
      assetVersion: 1,
      blob: new Blob(['png'], { type: 'image/png' }),
      width: 1440,
      height: 1080,
    },
    url: 'blob:test',
    release: vi.fn<() => void>(),
  }
  vi.mocked(createImageResource).mockReset().mockResolvedValue(resource)
  vi.mocked(loadBuiltinImage).mockReset().mockResolvedValue(resource)
})

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('动效阶段与提交隔离', () => {
  let changePreference: (event: { matches: boolean }) => void
  const removeListener = vi.fn<(...args: unknown[]) => void>()

  beforeEach(() => {
    removeListener.mockReset()
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_: string, listener: typeof changePreference) => {
        changePreference = listener
      },
      removeEventListener: removeListener,
    }))
  })

  async function restored(tiles = [1, 2, 0, 4, 3, 5, 7, 6, 8]) {
    storage.read.mockResolvedValue({
      version: 1,
      image: resource.image,
      state: { sessionId: 'motion-fixture', gridSize: 3, startMode: 'random', tiles, moves: 7 },
    })
    const result = setup()
    await result.session.initialize()
    return result
  }

  it('交换先提交并保存，落位期间拒绝重入、换局与覆盖层，结束即可继续', async () => {
    const { session } = await restored()
    const request = { sessionId: 'motion-fixture', expectedMoves: 7, sourceSlot: 0, targetSlot: 1 }
    expect(session.commitSwap(request)).toBe(true)
    expect(session.state.value?.tiles).toEqual([2, 1, 0, 4, 3, 5, 7, 6, 8])
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(session.phase.value).toBe('swapping')
    session.cancelPointer(1) // 正常释放后的 lostpointercapture 不影响已提交落位。
    expect(session.phase.value).toBe('swapping')
    expect(session.commitSwap({ ...request, expectedMoves: 8, targetSlot: 2 })).toBe(false)
    session.selectSlot(2, 'motion-fixture')
    session.openSettings()
    session.toggleOriginal()
    session.requestRestart()
    expect(session.selectedSlot.value).toBeNull()
    expect(session.settingsOpen.value || session.originalOpen.value).toBe(false)
    expect(session.confirmation.value).toBeNull()
    const motion = session.motion.value!
    session.finishMotion(motion.id, motion.sessionId)
    expect(session.canInteract.value).toBe(true)
    expect(storage.save).toHaveBeenCalledTimes(1)
  })

  it('最后交换立即逻辑完成，落位后才进入完整反馈，结束后才开放完成操作', async () => {
    const { session } = await restored([0, 1, 2, 3, 4, 5, 6, 8, 7])
    session.selectSlot(7, 'motion-fixture')
    session.selectSlot(8, 'motion-fixture')
    expect(session.completed.value).toBe(true)
    expect(session.visualCompleted.value).toBe(false)
    expect(storage.save.mock.calls[0]?.[0].state.tiles).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    const landing = session.motion.value!
    session.finishMotion(landing.id, landing.sessionId)
    expect(session.phase.value).toBe('completing')
    expect(session.canUseActions.value).toBe(false)
    session.finishMotion(landing.id, landing.sessionId)
    expect(session.phase.value).toBe('completing')
    const completion = session.motion.value!
    session.finishMotion(completion.id, completion.sessionId)
    expect(session.visualCompleted.value).toBe(true)
    expect(session.canUseActions.value).toBe(true)
  })

  it.each([false, true])('已提交落位中断直接稳定，完成=%s，迟到回调不影响新局', async (final) => {
    const { session } = await restored(final ? [1, 0, 2, 3, 4, 5, 6, 7, 8] : undefined)
    session.commitSwap({
      sessionId: 'motion-fixture',
      expectedMoves: 7,
      sourceSlot: 0,
      targetSlot: 1,
    })
    const committed = session.state.value
    const old = session.motion.value!
    session.settleMotion(old.id, old.sessionId)
    expect(session.state.value).toBe(committed)
    expect(session.visualCompleted.value).toBe(final)
    expect(session.canUseActions.value).toBe(true)
    expect(storage.save).toHaveBeenCalledTimes(1)
    session.requestRestart()
    if (!final) session.confirmAction()
    const entering = session.motion.value
    session.finishMotion(old.id, old.sessionId)
    session.settleMotion(old.id, old.sessionId)
    expect(session.motion.value).toBe(entering)
    expect(session.state.value?.moves).toBe(0)
  })

  it('非法释放进入返回，期间不保存，系统收尾后可操作', async () => {
    const { session } = await restored()
    const bounds = { left: 0, top: 0, width: 300, height: 150 }
    const pointer: PointerInput = {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    }
    const before = session.state.value
    session.beginPointer(pointer, bounds, 'motion-fixture')
    session.endPointer({ ...pointer, clientX: -20 }, bounds)
    expect(session.phase.value).toBe('returning')
    expect(session.canInteract.value).toBe(false)
    const returning = session.motion.value!
    session.settleMotion(returning.id, returning.sessionId)
    expect(session.state.value).toBe(before)
    expect(session.phase.value).toBe('ready')
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('媒体设置在落位中改变立即收尾；reduce 下新局和最后交换都不等待动效', async () => {
    const { session, scope } = await restored([1, 0, 2, 3, 4, 5, 6, 7, 8])
    session.commitSwap({
      sessionId: 'motion-fixture',
      expectedMoves: 7,
      sourceSlot: 0,
      targetSlot: 1,
    })
    changePreference({ matches: true })
    expect(session.visualCompleted.value).toBe(true)
    expect(session.motion.value).toBeNull()
    session.requestRestart()
    expect(session.phase.value).toBe('ready')
    scope.stop()
    expect(removeListener).toHaveBeenCalledWith('change', changePreference)
  })

  it.each([false, true])('恢复局面不发布任何动效，完成=%s；明确新局才入场', async (final) => {
    const { session } = await restored(final ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : undefined)
    expect(session.motion.value).toBeNull()
    expect(session.visualCompleted.value).toBe(final)
    expect(storage.save).not.toHaveBeenCalled()
    session.requestRestart()
    if (!final) session.confirmAction()
    expect(session.motion.value?.kind).toBe('entering')
  })
})

describe('指针手势提交与中断', () => {
  const bounds = { left: 10, top: 20, width: 300, height: 150 }
  const pointer = (x: number, y = 40, extra: Partial<PointerInput> = {}): PointerInput => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    ...extra,
  })
  async function restored() {
    storage.read.mockResolvedValue({
      version: 1,
      image: resource.image,
      state: {
        sessionId: 'input-fixture',
        gridSize: 3,
        startMode: 'random',
        tiles: [1, 2, 0, 4, 3, 5, 7, 6, 8],
        moves: 7,
      },
    })
    const { session } = setup()
    await session.initialize()
    return session
  }

  it('阈值下按点选处理，达到 6px 清除先前选择并采用实际来源', async () => {
    const session = await restored()
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    session.endPointer(pointer(35.999), bounds)
    expect(session.selectedSlot.value).toBe(0)
    session.beginPointer(pointer(130), bounds, 'input-fixture')
    session.movePointer(pointer(136), bounds)
    expect(session.selectedSlot.value).toBeNull()
    expect(session.pointerGesture.value).toMatchObject({
      phase: 'dragging',
      sourceSlot: 1,
      offsetX: 20,
      offsetY: 20,
      width: 100,
      height: 50,
    })
    session.endPointer(pointer(230), bounds)
    session.endPointer(pointer(230), bounds)
    expect(session.state.value?.tiles).toEqual([1, 0, 2, 4, 3, 5, 7, 6, 8])
    expect(session.state.value?.moves).toBe(8)
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(session.pointerGesture.value).toBeNull()
  })

  it('松手用实时坐标重新命中，移动与选择均不保存', async () => {
    const session = await restored()
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    session.movePointer(pointer(130), bounds)
    expect(session.pointerGesture.value?.targetSlot).toBe(1)
    expect(storage.save).not.toHaveBeenCalled()
    session.endPointer(pointer(230), bounds)
    expect(session.state.value?.tiles).toEqual([0, 2, 1, 4, 3, 5, 7, 6, 8])
    expect(storage.save).toHaveBeenCalledTimes(1)
    session.cancelPointer(1) // 正常 release 后的 lostcapture
    expect(session.state.value?.moves).toBe(8)
  })

  it.each([
    [30, 40],
    [230, 90],
    [9.99, 40],
    [310, 40],
    [30, 170],
  ])('拖动释放在同格/锁定格/边框/界外 (%i, %i) 不提交', async (x, y) => {
    const session = await restored()
    const before = session.state.value
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    session.movePointer(pointer(130), bounds)
    session.endPointer(pointer(x, y), bounds)
    expect(session.state.value).toBe(before)
    expect(session.selectedSlot.value).toBeNull()
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('次指针、鼠标非主键、锁定来源、不同 pointerId 均不接管手势', async () => {
    const session = await restored()
    for (const event of [
      pointer(30, 40, { isPrimary: false }),
      pointer(30, 40, { button: 2 }),
      pointer(230, 90),
    ]) {
      session.beginPointer(event, bounds, 'input-fixture')
      expect(session.pointerGesture.value).toBeNull()
    }
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    session.beginPointer(pointer(130, 40, { pointerId: 2 }), bounds, 'input-fixture')
    session.movePointer(pointer(130, 40, { pointerId: 2 }), bounds)
    session.endPointer(pointer(130, 40, { pointerId: 2 }), bounds)
    session.cancelPointer(2)
    expect(session.pointerGesture.value).toMatchObject({
      pointerId: 1,
      sourceSlot: 0,
      phase: 'pressed',
    })
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('无活动手势的滚动/外部取消保留选择；滚动后点选按新坐标只提交一次', async () => {
    const session = await restored()
    session.selectSlot(0, 'input-fixture')
    session.cancelPointer()
    session.cancelPointer(99)
    expect(session.selectedSlot.value).toBe(0)
    const scrolled = { ...bounds, top: -100 }
    session.beginPointer(pointer(130, -80), scrolled, 'input-fixture')
    session.endPointer(pointer(130, -80), scrolled)
    expect(session.state.value?.tiles).toEqual([2, 1, 0, 4, 3, 5, 7, 6, 8])
    expect(storage.save).toHaveBeenCalledTimes(1)
  })

  it.each(['pressed', 'dragging'] as const)(
    '%s 取消后迟到释放不提交，失焦取消已有选择',
    async (phase) => {
      const session = await restored()
      session.selectSlot(2, 'input-fixture')
      session.beginPointer(pointer(30), bounds, 'input-fixture')
      if (phase === 'dragging') session.movePointer(pointer(130), bounds)
      session.cancelPointer(1)
      session.endPointer(pointer(230), bounds)
      expect(session.selectedSlot.value).toBeNull()
      expect(session.pointerGesture.value).toBeNull()
      expect(storage.save).not.toHaveBeenCalled()
      session.selectSlot(2, 'input-fixture')
      session.cancelInteraction()
      expect(session.selectedSlot.value).toBeNull()
    },
  )

  it('手势期间不开放原图、设置或重开；主动取消后覆盖层互斥且不接受旧释放', async () => {
    const session = await restored()
    for (const overlay of ['original', 'settings', 'confirmation']) {
      session.beginPointer(pointer(30), bounds, 'input-fixture')
      if (overlay === 'original') session.toggleOriginal()
      else if (overlay === 'settings') session.openSettings()
      else session.requestRestart()
      expect(session.pointerGesture.value?.phase).toBe('pressed')
      expect(session.originalOpen.value).toBe(false)
      expect(session.settingsOpen.value).toBe(false)
      expect(session.confirmation.value).toBeNull()
      session.cancelPointer()
      if (overlay === 'original') session.toggleOriginal()
      else if (overlay === 'settings') session.openSettings()
      else session.requestRestart()
      expect(session.pointerGesture.value).toBeNull()
      session.beginPointer(pointer(130), bounds, 'input-fixture')
      expect(session.pointerGesture.value).toBeNull()
      session.closeOriginal()
      session.closeSettings()
      session.cancelConfirmation()
      session.endPointer(pointer(230), bounds)
    }
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('新局清除旧指针；旧版本提交和旧释放都不能改变新局', async () => {
    const session = await restored()
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    session.movePointer(pointer(130), bounds)
    session.cancelPointer()
    session.requestRestart()
    session.confirmAction()
    const next = session.state.value
    session.movePointer(pointer(230), bounds)
    session.endPointer(pointer(230), bounds)
    session.beginPointer(pointer(30), bounds, 'input-fixture')
    expect(session.pointerGesture.value).toBeNull()
    expect(session.state.value).toBe(next)
    expect(storage.save).toHaveBeenCalledTimes(1)
  })
})

describe('会话提交与点选', () => {
  it('默认 4×4 辅助开局；重复交换请求只提交一次', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
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
    await session.initialize()
    session.requestStart()
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
    await session.initialize()
    session.requestStart()
    const previous = currentState(session)
    session.requestRestart()
    const next = currentState(session)
    expect(next.sessionId).not.toBe(previous.sessionId)
    expect(session.confirmation.value === 'restart').toBe(false)
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
    await session.initialize()
    session.requestStart()
    const initial = currentState(session)
    const [first, second] = unlockedPair(initial)
    session.selectSlot(first, initial.sessionId)
    session.selectSlot(second, initial.sessionId)
    const moved = currentState(session)
    const [sourceSlot, targetSlot] = unlockedPair(moved)
    session.selectSlot(sourceSlot, moved.sessionId)
    session.requestRestart()
    expect(session.confirmation.value === 'restart').toBe(true)
    expect(
      session.commitSwap({ sessionId: moved.sessionId, expectedMoves: 1, sourceSlot, targetSlot }),
    ).toBe(false)
    session.cancelConfirmation()
    expect(session.state.value).toBe(moved)
    expect(session.selectedSlot.value).toBe(sourceSlot)
    session.requestRestart()
    session.confirmAction()
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
    await session.initialize()
    session.requestStart()
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
    expect(session.confirmation.value === 'restart').toBe(false)
    expect(session.completed.value).toBe(false)
    expect(session.canInteract.value).toBe(true)
    expect(session.state.value?.moves).toBe(0)
  })

  it('图片加载可重试，资源随会话作用域释放', async () => {
    vi.mocked(loadBuiltinImage).mockRejectedValueOnce(new Error('Network failure'))
    const { session, scope } = setup()
    await session.initialize()
    expect(session.loadError.value).toContain('请重试')
    expect(session.state.value).toBeNull()
    await session.chooseBuiltin(BUILTIN_IMAGES[0]!)
    expect(session.loadError.value).toBe('')
    expect(session.state.value).toBeNull()
    session.requestStart()
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
    const pending = session.initialize()
    await vi.waitFor(() => expect(loadBuiltinImage).toHaveBeenCalled())
    scope.stop()
    resolveImage?.(resource)
    await pending
    expect(resource.release).toHaveBeenCalledTimes(1)
    expect(session.state.value).toBeNull()
  })

  it('卸载后的点选与提交不再改变已释放的会话', async () => {
    const { session, scope } = setup()
    await session.initialize()
    session.requestStart()
    const current = currentState(session)
    const [sourceSlot, targetSlot] = unlockedPair(current)
    expect(session.canInteract.value).toBe(true)
    scope.stop()
    session.selectSlot(sourceSlot, current.sessionId)
    expect(session.selectedSlot.value).toBeNull()
    expect(
      session.commitSwap({
        sessionId: current.sessionId,
        expectedMoves: 0,
        sourceSlot,
        targetSlot,
      }),
    ).toBe(false)
    expect(session.state.value).toBe(current)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function otherResource(id: string): PuzzleImageResource {
  return {
    ...resource,
    image: { ...resource.image, id },
    url: `blob:${id}`,
    release: vi.fn<() => void>(),
  }
}

const city = BUILTIN_IMAGES[1]!
const plants = BUILTIN_IMAGES[2]!

describe('候选设置与图片资源', () => {
  it('候选已就绪时卸载，延后的开始事件不能用已释放资源建局', async () => {
    const { session, scope } = setup()
    await session.initialize()
    expect(session.canStart.value).toBe(true)
    scope.stop()
    session.requestStart()
    expect(session.state.value).toBeNull()
    expect(resource.release).toHaveBeenCalledTimes(1)
  })

  it('首次只准备默认候选，明确开始后才创建局面；同一开始请求不重复建局', async () => {
    const { session } = setup()
    await session.initialize()
    expect(session.state.value).toBeNull()
    expect(session.imageResource.value).toBeNull()
    expect(session.candidateResource.value).toBe(resource)
    expect(session.candidateConfig.value).toEqual({ gridSize: 4, startMode: 'assisted' })
    session.setCandidateConfig({ gridSize: 6, startMode: 'random' })
    session.requestStart()
    const current = currentState(session)
    expect(current).toMatchObject({ gridSize: 6, startMode: 'random', moves: 0 })
    session.requestStart()
    expect(session.state.value).toBe(current)
    await nextTick()
    expect(resource.release).not.toHaveBeenCalled()
  })

  it('设置借用当前图片；取消配置后回到旧局，不回收仍在使用的图片', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    const old = currentState(session)
    session.openSettings()
    expect(session.candidateResource.value).toBe(resource)
    session.setCandidateConfig({ gridSize: 3, startMode: 'random' })
    session.closeSettings()
    await nextTick()
    expect(session.state.value).toBe(old)
    expect(resource.release).not.toHaveBeenCalled()
    session.openSettings()
    expect(session.candidateConfig.value).toEqual({ gridSize: 4, startMode: 'assisted' })
  })

  it('当前图与独立候选各自释放，替换需等旧视图退出', async () => {
    const { session, scope } = setup()
    await session.initialize()
    session.requestStart()
    session.openSettings()
    const next = otherResource('city-windows')
    vi.mocked(loadBuiltinImage).mockResolvedValueOnce(next)
    await session.chooseBuiltin(city)
    expect(session.imageResource.value).toBe(resource)
    session.requestStart()
    expect(session.imageResource.value).toBe(next)
    expect(resource.release).not.toHaveBeenCalled()
    await nextTick()
    expect(resource.release).toHaveBeenCalledTimes(1)
    expect(next.release).not.toHaveBeenCalled()
    scope.stop()
    expect(next.release).toHaveBeenCalledTimes(1)
  })

  it('取消独立候选只释放候选；再次打开恢复当前配置', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    session.openSettings()
    const candidate = otherResource('plants')
    vi.mocked(loadBuiltinImage).mockResolvedValueOnce(candidate)
    await session.chooseBuiltin(plants)
    session.closeSettings()
    await nextTick()
    expect(candidate.release).toHaveBeenCalledTimes(1)
    expect(resource.release).not.toHaveBeenCalled()
  })

  it('新局有进度时只确认一次；取消保持局面且可修改候选', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    const initial = currentState(session)
    const [sourceSlot, targetSlot] = unlockedPair(initial)
    session.commitSwap({ sessionId: initial.sessionId, expectedMoves: 0, sourceSlot, targetSlot })
    const moved = currentState(session)
    session.openSettings()
    session.setCandidateConfig({ gridSize: 5, startMode: 'random' })
    session.requestStart()
    session.requestStart()
    expect(session.confirmation.value).toBe('new-game')
    expect(session.state.value).toBe(moved)
    session.cancelConfirmation()
    expect(session.settingsOpen.value).toBe(true)
    session.requestStart()
    session.confirmAction()
    const next = currentState(session)
    expect(next.sessionId).not.toBe(moved.sessionId)
    expect(next).toMatchObject({ gridSize: 5, startMode: 'random', moves: 0 })
    session.confirmAction()
    expect(session.state.value).toBe(next)
  })

  it('原图清空选择并禁止交换；返回拼图才可打开设置，关闭后原局可操作', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    const old = currentState(session)
    const [first, second] = unlockedPair(old)
    session.selectSlot(first, old.sessionId)
    session.toggleOriginal()
    expect(session.selectedSlot.value).toBeNull()
    expect(session.canInteract.value).toBe(false)
    session.selectSlot(second, old.sessionId)
    expect(session.state.value).toBe(old)
    session.openSettings()
    expect(session.originalOpen.value).toBe(true)
    expect(session.settingsOpen.value).toBe(false)
    session.closeOriginal()
    session.openSettings()
    expect(session.originalOpen.value).toBe(false)
    session.toggleOriginal()
    expect(session.settingsOpen.value).toBe(true)
    session.closeSettings()
    expect(session.canInteract.value).toBe(true)
  })

  it('连续选图只采用最新成功请求，旧请求晚到须释放', async () => {
    const { session } = setup()
    await session.initialize()
    const first = deferred<PuzzleImageResource>()
    const second = deferred<PuzzleImageResource>()
    const latest = otherResource('plants')
    const late = otherResource('late-city')
    vi.mocked(loadBuiltinImage)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const a = session.chooseBuiltin(city)
    const b = session.chooseBuiltin(plants)
    expect(session.canStart.value).toBe(false)
    second.resolve(latest)
    await b
    first.resolve(late)
    await a
    expect(session.candidateResource.value).toBe(latest)
    expect(session.loading.value).toBe(false)
    expect(late.release).toHaveBeenCalledTimes(1)
  })

  it('旧请求失败不覆盖新预览；最新失败保持旧局且不能开始', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    const old = currentState(session)
    session.openSettings()
    const first = deferred<PuzzleImageResource>()
    vi.mocked(loadBuiltinImage).mockReturnValueOnce(first.promise)
    const pending = session.chooseBuiltin(city)
    await session.chooseBuiltin(BUILTIN_IMAGES[0]!)
    first.reject(new ImagePreparationError('旧错误'))
    await pending
    expect(session.loadError.value).toBe('')
    vi.mocked(loadUploadedImage).mockRejectedValueOnce(
      new ImagePreparationError('图片超过 10 MiB，请选择更小的文件。'),
    )
    await session.chooseUpload(new File([], 'large.png'))
    expect(session.loadError.value).toContain('10 MiB')
    expect(session.candidateResource.value).toBe(resource)
    expect(session.canStart.value).toBe(false)
    session.requestStart()
    expect(session.state.value).toBe(old)
    expect(session.imageResource.value).toBe(resource)
  })

  it('处理中关闭后重开并换局，晚到资源不能污染新局', async () => {
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    session.openSettings()
    const deferredImage = deferred<PuzzleImageResource>()
    const late = otherResource('late-upload')
    vi.mocked(loadUploadedImage).mockReturnValueOnce(deferredImage.promise)
    const pending = session.chooseUpload(new File([], 'late.png'))
    session.closeSettings()
    session.requestRestart()
    const restarted = currentState(session)
    session.openSettings()
    deferredImage.resolve(late)
    await pending
    expect(session.state.value).toBe(restarted)
    expect(session.candidateResource.value).toBe(resource)
    expect(late.release).toHaveBeenCalledTimes(1)
    expect(resource.release).not.toHaveBeenCalled()
  })

  it('新局提交使同轮更早的图片任务失效', async () => {
    const { session } = setup()
    await session.initialize()
    const pendingImage = deferred<PuzzleImageResource>()
    const late = otherResource('late-city')
    vi.mocked(loadBuiltinImage).mockReturnValueOnce(pendingImage.promise)
    const pending = session.chooseBuiltin(city)
    await session.chooseBuiltin(BUILTIN_IMAGES[0]!)
    session.requestStart()
    const started = currentState(session)
    pendingImage.resolve(late)
    await pending
    expect(session.state.value).toBe(started)
    expect(session.imageResource.value).toBe(resource)
    expect(late.release).toHaveBeenCalledTimes(1)
  })
})

function savedState(): PuzzleSave {
  return {
    version: 1,
    image: resource.image,
    state: {
      sessionId: 'restored',
      gridSize: 3,
      startMode: 'random',
      tiles: [1, 0, 2, 3, 4, 5, 6, 7, 8],
      moves: 7,
    },
  }
}

describe('恢复、提交保存与异步收尾', () => {
  it('读取与图片恢复完成前不能开局、选图或保存；恢复不会触发保存', async () => {
    const read = deferred<unknown>()
    const decode = deferred<PuzzleImageResource>()
    storage.read.mockReturnValueOnce(read.promise)
    vi.mocked(createImageResource).mockReturnValueOnce(decode.promise)
    const { session } = setup()
    const initialization = session.initialize()
    expect(session.initialize()).toBe(initialization)
    session.requestStart()
    await session.chooseBuiltin(city)
    expect(loadBuiltinImage).not.toHaveBeenCalled()
    expect(storage.save).not.toHaveBeenCalled()
    const saved = savedState()
    read.resolve(saved)
    await vi.waitFor(() => expect(createImageResource).toHaveBeenCalled())
    expect(session.restoring.value).toBe(true)
    expect(session.state.value).toBeNull()
    decode.resolve(resource)
    await initialization
    expect(session.restoring.value).toBe(false)
    expect(session.state.value).toEqual(saved.state)
    expect(session.imageResource.value).toBe(resource)
    expect(session.canInteract.value).toBe(true)
    expect(storage.save).not.toHaveBeenCalled()
    session.requestRestart()
    session.confirmAction()
    expect(session.state.value).toMatchObject({ gridSize: 3, startMode: 'random', moves: 0 })
    expect(storage.save).toHaveBeenCalledTimes(1)
  })

  it('完成存档直接进入稳定完成状态', async () => {
    const saved = savedState()
    storage.read.mockResolvedValueOnce({
      ...saved,
      state: { ...saved.state, tiles: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    })
    const { session } = setup()
    await session.initialize()
    expect(session.completed.value).toBe(true)
    expect(session.canInteract.value).toBe(false)
    expect(session.selectedSlot.value).toBeNull()
    expect(session.settingsOpen.value).toBe(false)
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('没有记录只准备选图；只有明确新局与合法交换保存', async () => {
    const { session } = setup()
    await session.initialize()
    expect(storage.save).not.toHaveBeenCalled()
    session.requestStart()
    const initial = currentState(session)
    expect(storage.save).toHaveBeenLastCalledWith({
      version: 1,
      image: resource.image,
      state: initial,
    })
    session.toggleOriginal()
    session.closeOriginal()
    session.openSettings()
    session.setCandidateConfig({ gridSize: 3, startMode: 'random' })
    session.closeSettings()
    session.commitSwap({ sessionId: 'old-session', expectedMoves: 0, sourceSlot: 0, targetSlot: 5 })
    expect(storage.save).toHaveBeenCalledTimes(1)
    const [sourceSlot, targetSlot] = unlockedPair(initial)
    const request = { sessionId: initial.sessionId, expectedMoves: 0, sourceSlot, targetSlot }
    session.commitSwap(request)
    session.commitSwap(request)
    expect(storage.save).toHaveBeenCalledTimes(2)
    expect(storage.save.mock.calls.map(([save]) => save.state.moves)).toEqual([0, 1])
    expect(storage.save.mock.calls[0]?.[0].state).toEqual(initial)
  })

  it('读取失败可开始新局，成功保存后清除提示', async () => {
    storage.read.mockRejectedValueOnce(new Error('unavailable'))
    const { session } = setup()
    await session.initialize()
    expect(session.recoveryError.value).toBe('上次进度无法恢复，请开始新局')
    expect(session.saveError.value).toBe('本局暂时无法保存，刷新后可能丢失进度')
    expect(session.canStart.value).toBe(true)
    session.requestStart()
    await nextTick()
    expect(session.recoveryError.value).toBe('')
    expect(session.saveError.value).toBe('')
  })

  it('坏记录只显示提示；解码失败也不写入替代局面', async () => {
    storage.read.mockResolvedValueOnce({ ...savedState(), version: 2 })
    const first = setup().session
    await first.initialize()
    expect(first.recoveryError.value).toContain('无法恢复')
    expect(first.state.value).toBeNull()
    storage.read.mockResolvedValueOnce(savedState())
    vi.mocked(createImageResource).mockRejectedValueOnce(new Error('broken image'))
    const second = setup().session
    await second.initialize()
    expect(second.recoveryError.value).toContain('无法恢复')
    expect(second.state.value).toBeNull()
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('写入失败不回滚内存；旧回调不能清除较新失败，后续成功可清除提示', async () => {
    const firstSave = deferred<void>()
    storage.save.mockReturnValueOnce(firstSave.promise).mockRejectedValueOnce(new Error('quota'))
    const { session } = setup()
    await session.initialize()
    session.requestStart()
    session.requestRestart()
    const current = currentState(session)
    await nextTick()
    expect(session.saveError.value).toContain('暂时无法保存')
    firstSave.resolve()
    await nextTick()
    expect(session.saveError.value).toContain('暂时无法保存')
    expect(session.state.value).toBe(current)
    const [sourceSlot, targetSlot] = unlockedPair(current)
    session.commitSwap({ sessionId: current.sessionId, expectedMoves: 0, sourceSlot, targetSlot })
    expect(session.state.value?.moves).toBe(1)
    await nextTick()
    expect(session.saveError.value).toBe('')
  })

  it('卸载关闭存储；迟到的恢复资源释放且不更新状态', async () => {
    storage.read.mockResolvedValueOnce(savedState())
    const decode = deferred<PuzzleImageResource>()
    vi.mocked(createImageResource).mockReturnValueOnce(decode.promise)
    const { session, scope } = setup()
    const initialization = session.initialize()
    await vi.waitFor(() => expect(createImageResource).toHaveBeenCalled())
    scope.stop()
    decode.resolve(resource)
    await initialization
    expect(storage.close).toHaveBeenCalledTimes(1)
    expect(resource.release).toHaveBeenCalledTimes(1)
    expect(session.state.value).toBeNull()
    expect(storage.save).not.toHaveBeenCalled()
  })
})
