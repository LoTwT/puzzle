import { describe, expect, it, vi } from 'vitest'

import { createMotionGroup, type MotionOutcome } from './motion'

function animationFixture() {
  let resolve!: (value: Animation) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<Animation>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  const finished = { promise, resolve, reject }
  const animation = {
    finished: finished.promise,
    cancel: vi.fn<() => void>(() => finished.reject(new Error('cancelled'))),
  }
  const element = { animate: vi.fn<() => typeof animation>(() => animation) } as unknown as Element
  return { element, animation, finished }
}

describe('原生动效收尾', () => {
  it('主动取消同步且仅清理一次，不依赖 finish 事件', async () => {
    const { element, animation } = animationFixture()
    const settled = vi.fn<(outcome: MotionOutcome) => void>()
    const group = createMotionGroup()
    group.animate(element, [], { duration: 180 }, settled)
    group.cancel()
    expect(settled).toHaveBeenCalledExactlyOnceWith('cancelled')
    await Promise.resolve()
    group.cancel()
    expect(settled).toHaveBeenCalledTimes(1)
    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })

  it('浏览器取消 finished 的拒绝同样解锁，无未处理拒绝', async () => {
    const { element, animation } = animationFixture()
    const settled = vi.fn<(outcome: MotionOutcome) => void>()
    createMotionGroup().animate(element, [], { duration: 180 }, settled)
    animation.cancel()
    await Promise.resolve()
    expect(settled).toHaveBeenCalledExactlyOnceWith('cancelled')
  })

  it('正常结束释放句柄；原生 API 不可用时立即按取消收尾', async () => {
    const { element, finished } = animationFixture()
    const settled = vi.fn<(outcome: MotionOutcome) => void>()
    const group = createMotionGroup()
    group.animate(element, [], { duration: 180 }, settled)
    finished.resolve({} as Animation)
    await Promise.resolve()
    group.cancel()
    expect(settled).toHaveBeenCalledExactlyOnceWith('finished')
    const unavailable = vi.fn<(outcome: MotionOutcome) => void>()
    group.animate({} as Element, [], { duration: 180 }, unavailable)
    expect(unavailable).toHaveBeenCalledExactlyOnceWith('cancelled')
  })
})
