import { computed, onScopeDispose, shallowRef } from 'vue'

import { DEFAULT_GRID_SIZE, DEFAULT_START_MODE } from '../puzzle/constants'
import { GEOMETRY_IMAGE, loadBuiltinImage } from '../puzzle/images'
import {
  applySwap,
  createPuzzle,
  getCorrectSlots,
  isComplete,
  isSlotLocked,
  isValidSlot,
} from '../puzzle/rules'
import type {
  PuzzleConfig,
  PuzzleImageResource,
  PuzzleState,
  SlotIndex,
  SwapRequest,
} from '../puzzle/types'

export function usePuzzleSession() {
  const state = shallowRef<PuzzleState | null>(null)
  const imageResource = shallowRef<PuzzleImageResource | null>(null)
  const selectedSlot = shallowRef<SlotIndex | null>(null)
  const loading = shallowRef(false)
  const loadError = shallowRef('')
  const restartConfirmationOpen = shallowRef(false)
  let disposed = false

  const correctSlots = computed(() => getCorrectSlots(state.value?.tiles ?? []))
  const completed = computed(() => isComplete(state.value?.tiles ?? []))
  const canInteract = computed(
    () =>
      state.value !== null && !completed.value && !loading.value && !restartConfirmationOpen.value,
  )

  function startPuzzle(config: PuzzleConfig) {
    state.value = createPuzzle({ ...config, sessionId: crypto.randomUUID() })
    selectedSlot.value = null
    restartConfirmationOpen.value = false
  }

  async function loadInitialImage() {
    if (disposed || loading.value || imageResource.value) return
    loading.value = true
    loadError.value = ''
    try {
      const resource = await loadBuiltinImage(GEOMETRY_IMAGE)
      if (disposed) {
        resource.release()
        return
      }
      imageResource.value = resource
      startPuzzle({ gridSize: DEFAULT_GRID_SIZE, startMode: DEFAULT_START_MODE })
    } catch {
      if (!disposed) loadError.value = '图片加载失败，请重试。'
    } finally {
      if (!disposed) loading.value = false
    }
  }

  /** 所有输入共用此入口；先提交局面，再由视图读取最终状态。 */
  function commitSwap(request: SwapRequest): boolean {
    const current = state.value
    if (
      !canInteract.value ||
      !current ||
      request.sessionId !== current.sessionId ||
      request.expectedMoves !== current.moves
    )
      return false
    const next = applySwap(current, request.sourceSlot, request.targetSlot)
    if (!next) return false
    state.value = next
    selectedSlot.value = null
    return true
  }

  function selectSlot(slot: SlotIndex, sessionId: string) {
    const current = state.value
    if (
      !canInteract.value ||
      !current ||
      current.sessionId !== sessionId ||
      !isValidSlot(current.tiles, slot) ||
      isSlotLocked(current.tiles, slot)
    )
      return
    if (selectedSlot.value === slot) {
      selectedSlot.value = null
    } else if (selectedSlot.value === null) {
      selectedSlot.value = slot
    } else {
      commitSwap({
        sessionId,
        expectedMoves: current.moves,
        sourceSlot: selectedSlot.value,
        targetSlot: slot,
      })
    }
  }

  function requestRestart() {
    if (!state.value || loading.value || restartConfirmationOpen.value) return
    if (state.value.moves > 0 && !completed.value) {
      restartConfirmationOpen.value = true
    } else {
      startPuzzle(state.value)
    }
  }

  function cancelRestart() {
    restartConfirmationOpen.value = false
  }

  function confirmRestart() {
    if (restartConfirmationOpen.value && state.value) startPuzzle(state.value)
  }

  onScopeDispose(() => {
    disposed = true
    imageResource.value?.release()
  })

  return {
    state: computed(() => state.value),
    imageResource: computed(() => imageResource.value),
    selectedSlot: computed(() => selectedSlot.value),
    loading: computed(() => loading.value),
    loadError: computed(() => loadError.value),
    restartConfirmationOpen: computed(() => restartConfirmationOpen.value),
    correctSlots,
    completed,
    canInteract,
    loadInitialImage,
    commitSwap,
    selectSlot,
    requestRestart,
    cancelRestart,
    confirmRestart,
  }
}
