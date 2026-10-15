import type { PointerGesture, SlotIndex, SwapRequest, TileId } from './types.ts'

interface MotionIdentity {
  readonly id: number
  readonly sessionId: string
}

/** 仅供呈现的提交快照，不进入存档，也不能再次提交交换。 */
export type BoardMotion = MotionIdentity &
  (
    | { readonly kind: 'entering' | 'original-in' | 'original-out' }
    | {
        readonly kind: 'returning'
        readonly gesture: PointerGesture
        readonly tile: TileId
      }
    | {
        readonly kind: 'swapping'
        readonly swap: SwapRequest
        readonly sourceTile: TileId
        readonly targetTile: TileId
        readonly gesture: PointerGesture | null
        readonly newlyCorrect: readonly SlotIndex[]
        readonly completes: boolean
      }
    | { readonly kind: 'completing'; readonly newlyCorrect: readonly SlotIndex[] }
  )

export type MotionOutcome = 'finished' | 'cancelled'
export type PuzzlePhase =
  | BoardMotion['kind']
  | PointerGesture['phase']
  | 'preparing'
  | 'ready'
  | 'completed'

/** 主动取消同步收尾；浏览器取消走 rejected finished，同样是正常结果。 */
export function createMotionGroup() {
  const pending = new Set<() => void>()

  function animate(
    element: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
    onSettled: (outcome: MotionOutcome) => void = () => {},
  ) {
    let animation: Animation | undefined
    let settled = false
    function settle(outcome: MotionOutcome) {
      if (settled) return
      settled = true
      pending.delete(cancel)
      animation?.cancel()
      onSettled(outcome)
    }
    const cancel = () => settle('cancelled')
    pending.add(cancel)
    try {
      animation = element.animate(frames, { fill: 'both', ...options })
      void animation.finished.then(() => settle('finished'), cancel)
    } catch {
      cancel()
    }
    return cancel
  }

  return {
    animate,
    cancel() {
      // 回调可能启动下一阶段；本轮只收尾取消前的句柄。
      const current = [...pending]
      for (const cancel of current) cancel()
    },
  }
}
