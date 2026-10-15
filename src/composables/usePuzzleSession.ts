import { computed, nextTick, onScopeDispose, shallowRef, watch } from 'vue'

import { DEFAULT_GRID_SIZE, DEFAULT_START_MODE } from '../puzzle/constants'
import {
  GEOMETRY_IMAGE,
  createImageResource,
  imageErrorMessage,
  loadBuiltinImage,
  loadUploadedImage,
} from '../puzzle/images'
import { acceptsPointer, hitTestSlot, reachedDragThreshold } from '../puzzle/input'
import type { BoardMotion, PuzzlePhase } from '../puzzle/motion'
import {
  applySwap,
  createPuzzle,
  createPuzzleSave,
  getCorrectSlots,
  isComplete,
  isSlotLocked,
  isValidSlot,
  isValidPuzzleSave,
} from '../puzzle/rules'
import { createPuzzleStorage } from '../puzzle/storage'
import type {
  BoardBounds,
  BuiltinImageMetadata,
  PuzzleConfig,
  PuzzleImageResource,
  PuzzleState,
  PointerGesture,
  PointerInput,
  SlotIndex,
  SwapRequest,
} from '../puzzle/types'

export function usePuzzleSession() {
  const state = shallowRef<PuzzleState | null>(null)
  const imageResource = shallowRef<PuzzleImageResource | null>(null)
  const selectedSlot = shallowRef<SlotIndex | null>(null)
  const pointerGesture = shallowRef<PointerGesture | null>(null)
  const motion = shallowRef<BoardMotion | null>(null)
  const motionPreference =
    typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)')
  const reducedMotion = shallowRef(motionPreference?.matches ?? true)
  let motionRevision = 0
  const candidateResource = shallowRef<PuzzleImageResource | null>(null)
  const candidateConfig = shallowRef<PuzzleConfig>({
    gridSize: DEFAULT_GRID_SIZE,
    startMode: DEFAULT_START_MODE,
  })
  const candidateImageId = shallowRef<string | null>(GEOMETRY_IMAGE.id)
  const loading = shallowRef(false)
  const loadError = shallowRef('')
  const overlay = shallowRef<'settings' | 'original' | null>('settings')
  const confirmation = shallowRef<'restart' | 'new-game' | null>(null)
  const restoring = shallowRef(true)
  const recoveryError = shallowRef('')
  const saveError = shallowRef('')
  const storage = createPuzzleStorage()
  let initialization: Promise<void> | null = null
  let saveRevision = 0
  let imageRequest = 0
  let disposed = false

  const correctSlots = computed(() => getCorrectSlots(state.value?.tiles ?? []))
  const completed = computed(() => isComplete(state.value?.tiles ?? []))
  const visualCompleted = computed(() => completed.value && motion.value === null)
  const phase = computed<PuzzlePhase>(
    () =>
      motion.value?.kind ??
      pointerGesture.value?.phase ??
      (state.value ? (completed.value ? 'completed' : 'ready') : 'preparing'),
  )
  const settingsOpen = computed(() => overlay.value === 'settings')
  const originalOpen = computed(() => overlay.value === 'original')
  const canInteract = computed(
    () =>
      !disposed &&
      state.value !== null &&
      !completed.value &&
      !motion.value &&
      !overlay.value &&
      !confirmation.value,
  )
  const canUseActions = computed(
    () =>
      !disposed &&
      !!state.value &&
      !motion.value &&
      !pointerGesture.value &&
      !overlay.value &&
      !confirmation.value,
  )
  const canToggleOriginal = computed(
    () =>
      !disposed && !completed.value && !motion.value && (canUseActions.value || originalOpen.value),
  )
  const canStart = computed(
    () =>
      !disposed &&
      !restoring.value &&
      settingsOpen.value &&
      !!candidateResource.value &&
      !loading.value &&
      !loadError.value &&
      !confirmation.value,
  )

  function cancelInteraction() {
    pointerGesture.value = null
    selectedSlot.value = null
  }

  function motionIdentity() {
    return { id: ++motionRevision, sessionId: state.value!.sessionId }
  }

  function settleMotion(id: number, sessionId: string) {
    if (disposed || motion.value?.id !== id || state.value?.sessionId !== sessionId) return
    if (motion.value.kind === 'original-out') overlay.value = null
    motion.value = null
  }

  function finishMotion(id: number, sessionId: string) {
    const current = motion.value
    if (disposed || current?.id !== id || state.value?.sessionId !== sessionId) return
    if (current.kind === 'swapping' && current.completes && !reducedMotion.value) {
      motion.value = { ...motionIdentity(), kind: 'completing', newlyCorrect: current.newlyCorrect }
    } else settleMotion(id, sessionId)
  }

  function onMotionPreference(event: MediaQueryListEvent) {
    reducedMotion.value = event.matches
    if (event.matches && motion.value) settleMotion(motion.value.id, motion.value.sessionId)
  }
  motionPreference?.addEventListener('change', onMotionPreference)

  // 外部滚动和不属于图块的 pointercancel 不应取消已完成的点选。
  function cancelPointer(pointerId?: number) {
    if (
      pointerGesture.value &&
      (pointerId === undefined || pointerGesture.value.pointerId === pointerId)
    )
      cancelInteraction()
  }

  watch(
    canInteract,
    (enabled) => {
      if (!enabled) cancelPointer()
    },
    { flush: 'sync' },
  )

  // 当前局与候选可以借用同一资源。等 Vue 撤下旧视图后，只释放双方均不再引用的 URL。
  function releaseUnused(resource: PuzzleImageResource | null) {
    if (!resource) return
    void nextTick(() => {
      if (resource !== imageResource.value && resource !== candidateResource.value)
        resource.release()
    })
  }

  function replaceCandidate(resource: PuzzleImageResource | null) {
    const previous = candidateResource.value
    candidateResource.value = resource
    releaseUnused(previous)
  }

  function invalidateImageRequest() {
    imageRequest++
    loading.value = false
  }

  function saveCurrent() {
    if (disposed || restoring.value || !state.value || !imageResource.value) return
    const snapshot = createPuzzleSave(imageResource.value.image, state.value)
    const revision = ++saveRevision
    const isCurrent = () =>
      !disposed && revision === saveRevision && state.value?.sessionId === snapshot.state.sessionId
    void storage.save(snapshot).then(
      () => {
        if (!isCurrent()) return
        saveError.value = ''
        recoveryError.value = ''
      },
      () => {
        if (isCurrent()) saveError.value = '本局暂时无法保存，刷新后可能丢失进度'
      },
    )
  }

  async function restore() {
    try {
      const saved = await storage.read().catch((error: unknown) => {
        if (!disposed) saveError.value = '本局暂时无法保存，刷新后可能丢失进度'
        throw error
      })
      if (disposed) return
      if (saved !== undefined) {
        if (!isValidPuzzleSave(saved)) throw new Error('Invalid puzzle save.')
        // WebKit 的数据库 Blob 可能仍引用存档文件；后续覆盖写入会使该引用失效。
        // 恢复时只复制一次原始字节，后续保存复用独立 Blob，不重新编码图片。
        const blob = new Blob([await saved.image.blob.arrayBuffer()], {
          type: saved.image.blob.type,
        })
        if (disposed) return
        const snapshot = createPuzzleSave({ ...saved.image, blob }, saved.state)
        const resource = await createImageResource(snapshot.image)
        if (disposed) {
          resource.release()
          return
        }
        imageResource.value = resource
        state.value = snapshot.state
        overlay.value = null
      }
    } catch {
      if (!disposed) recoveryError.value = '上次进度无法恢复，请开始新局'
    } finally {
      if (!disposed) restoring.value = false
    }
    if (!disposed && !state.value) await loadInitialImage()
  }

  function initialize() {
    if (!initialization) initialization = restore()
    return initialization
  }

  function startPuzzle(config: PuzzleConfig) {
    invalidateImageRequest()
    cancelInteraction()
    state.value = createPuzzle({ ...config, sessionId: crypto.randomUUID() })
    motion.value = reducedMotion.value ? null : { ...motionIdentity(), kind: 'entering' }
    selectedSlot.value = null
    overlay.value = null
    confirmation.value = null
    saveCurrent()
  }

  async function prepareImage(id: string | null, load: () => Promise<PuzzleImageResource>) {
    if (disposed || restoring.value || !settingsOpen.value || confirmation.value) return
    const request = ++imageRequest
    candidateImageId.value = id
    loading.value = true
    loadError.value = ''
    try {
      const resource = await load()
      if (disposed || request !== imageRequest || !settingsOpen.value) {
        resource.release()
        return
      }
      replaceCandidate(resource)
      candidateImageId.value = resource.image.id
    } catch (error) {
      if (!disposed && request === imageRequest) {
        loadError.value = imageErrorMessage(error)
        candidateImageId.value = candidateResource.value?.image.id ?? null
      }
    } finally {
      if (!disposed && request === imageRequest) loading.value = false
    }
  }

  function chooseBuiltin(metadata: BuiltinImageMetadata) {
    if (disposed || restoring.value || !settingsOpen.value || confirmation.value)
      return Promise.resolve()
    const reusable = [imageResource.value, candidateResource.value].find(
      (resource) =>
        resource?.image.source === 'builtin' &&
        resource.image.id === metadata.id &&
        resource.image.assetVersion === metadata.assetVersion,
    )
    if (reusable) {
      invalidateImageRequest()
      loadError.value = ''
      candidateImageId.value = metadata.id
      replaceCandidate(reusable)
      return Promise.resolve()
    }
    return prepareImage(metadata.id, () => loadBuiltinImage(metadata))
  }

  function chooseUpload(file: File) {
    return prepareImage(null, () => loadUploadedImage(file))
  }

  function loadInitialImage() {
    if (state.value || loading.value || candidateResource.value) return Promise.resolve()
    return chooseBuiltin(GEOMETRY_IMAGE)
  }

  function openSettings() {
    if (!canUseActions.value || !state.value) return
    invalidateImageRequest()
    candidateConfig.value = { gridSize: state.value.gridSize, startMode: state.value.startMode }
    replaceCandidate(imageResource.value)
    candidateImageId.value = imageResource.value?.image.id ?? null
    loadError.value = ''
    selectedSlot.value = null
    overlay.value = 'settings'
  }

  function closeSettings() {
    if (!state.value || !settingsOpen.value) return
    invalidateImageRequest()
    overlay.value = null
    confirmation.value = null
    loadError.value = ''
    replaceCandidate(null)
  }

  function setCandidateConfig(config: PuzzleConfig) {
    if (!disposed && !restoring.value && settingsOpen.value && !confirmation.value)
      candidateConfig.value = { ...config }
  }

  function commitCandidate() {
    if (!candidateResource.value || loading.value || loadError.value || !settingsOpen.value) return
    const previous = imageResource.value
    imageResource.value = candidateResource.value
    startPuzzle(candidateConfig.value)
    replaceCandidate(null)
    releaseUnused(previous)
  }

  function requestStart() {
    if (disposed || !canStart.value) return
    if (state.value && state.value.moves > 0 && !completed.value) confirmation.value = 'new-game'
    else commitCandidate()
  }

  function toggleOriginal() {
    if (!canToggleOriginal.value) return
    if (originalOpen.value) {
      closeOriginal()
      return
    }
    selectedSlot.value = null
    overlay.value = 'original'
    if (!reducedMotion.value) motion.value = { ...motionIdentity(), kind: 'original-in' }
  }

  function closeOriginal() {
    if (disposed || !originalOpen.value || motion.value) return
    if (reducedMotion.value) overlay.value = null
    else motion.value = { ...motionIdentity(), kind: 'original-out' }
  }

  /** 所有输入共用此入口；先提交局面，再由视图读取最终状态。 */
  function commitSwap(request: SwapRequest, gesture: PointerGesture | null = null): boolean {
    const current = state.value
    if (
      disposed ||
      pointerGesture.value !== null ||
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
    saveCurrent()
    if (!reducedMotion.value) {
      motion.value = {
        ...motionIdentity(),
        kind: 'swapping',
        swap: { ...request },
        sourceTile: current.tiles[request.sourceSlot]!,
        targetTile: current.tiles[request.targetSlot]!,
        gesture,
        newlyCorrect: [request.sourceSlot, request.targetSlot].filter(
          (slot) => next.tiles[slot] === slot,
        ),
        completes: isComplete(next.tiles),
      }
    }
    return true
  }

  function selectSlot(slot: SlotIndex, sessionId: string) {
    const current = state.value
    if (
      disposed ||
      pointerGesture.value !== null ||
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

  function beginPointer(event: PointerInput, bounds: BoardBounds, sessionId: string) {
    const current = state.value
    if (
      disposed ||
      !canInteract.value ||
      !current ||
      current.sessionId !== sessionId ||
      pointerGesture.value ||
      !acceptsPointer(event)
    )
      return
    const sourceSlot = hitTestSlot(event.clientX, event.clientY, bounds, current.gridSize)
    if (sourceSlot === null || isSlotLocked(current.tiles, sourceSlot)) return
    const width = bounds.width / current.gridSize
    const height = bounds.height / current.gridSize
    pointerGesture.value = {
      pointerId: event.pointerId,
      sessionId,
      expectedMoves: current.moves,
      sourceSlot,
      phase: 'pressed',
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - bounds.left - (sourceSlot % current.gridSize) * width,
      offsetY: event.clientY - bounds.top - Math.floor(sourceSlot / current.gridSize) * height,
      width,
      height,
      targetSlot: null,
    }
  }

  function movePointer(event: PointerInput, bounds: BoardBounds) {
    const gesture = pointerGesture.value
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const current = state.value
    if (
      !canInteract.value ||
      !current ||
      current.sessionId !== gesture.sessionId ||
      current.moves !== gesture.expectedMoves
    ) {
      cancelInteraction()
      return
    }
    const dragging =
      gesture.phase === 'dragging' ||
      reachedDragThreshold(event.clientX, event.clientY, gesture.startX, gesture.startY)
    if (!dragging) return
    selectedSlot.value = null
    const target = hitTestSlot(event.clientX, event.clientY, bounds, current.gridSize)
    pointerGesture.value = {
      ...gesture,
      phase: 'dragging',
      x: event.clientX,
      y: event.clientY,
      targetSlot:
        target !== null && target !== gesture.sourceSlot && !isSlotLocked(current.tiles, target)
          ? target
          : null,
    }
  }

  function endPointer(event: PointerInput, bounds: BoardBounds) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      cancelPointer(event.pointerId)
      return
    }
    // 即使最后一次 move 尚未绘制，也用松手坐标重新校验阈值和目标。
    movePointer(event, bounds)
    const gesture = pointerGesture.value
    if (!gesture || gesture.pointerId !== event.pointerId) return
    pointerGesture.value = null
    if (gesture.phase === 'dragging') {
      if (gesture.targetSlot !== null)
        commitSwap({ ...gesture, targetSlot: gesture.targetSlot }, gesture)
      else if (!reducedMotion.value)
        motion.value = {
          ...motionIdentity(),
          kind: 'returning',
          gesture,
          tile: state.value!.tiles[gesture.sourceSlot]!,
        }
    } else if (
      state.value &&
      hitTestSlot(event.clientX, event.clientY, bounds, state.value.gridSize) === gesture.sourceSlot
    ) {
      selectSlot(gesture.sourceSlot, gesture.sessionId)
    }
  }

  function requestRestart() {
    if (!canUseActions.value || !state.value) return
    if (state.value.moves > 0 && !completed.value) confirmation.value = 'restart'
    else startPuzzle(state.value)
  }

  function cancelConfirmation() {
    confirmation.value = null
  }

  function confirmAction() {
    if (disposed) return
    if (confirmation.value === 'restart' && state.value) startPuzzle(state.value)
    else if (confirmation.value === 'new-game') commitCandidate()
  }

  onScopeDispose(() => {
    cancelInteraction()
    disposed = true
    motion.value = null
    motionPreference?.removeEventListener('change', onMotionPreference)
    storage.close()
    invalidateImageRequest()
    for (const resource of new Set([imageResource.value, candidateResource.value]))
      resource?.release()
  })

  return {
    state: computed(() => state.value),
    imageResource: computed(() => imageResource.value),
    selectedSlot: computed(() => selectedSlot.value),
    pointerGesture: computed(() => pointerGesture.value),
    motion: computed(() => motion.value),
    reducedMotion: computed(() => reducedMotion.value),
    phase,
    visualCompleted,
    canUseActions,
    canToggleOriginal,
    finishMotion,
    settleMotion,
    candidateResource: computed(() => candidateResource.value),
    candidateConfig: computed(() => candidateConfig.value),
    candidateImageId: computed(() => candidateImageId.value),
    loading: computed(() => loading.value),
    loadError: computed(() => loadError.value),
    restoring: computed(() => restoring.value),
    recoveryError: computed(() => recoveryError.value),
    saveError: computed(() => saveError.value),
    confirmation: computed(() => confirmation.value),
    correctSlots,
    completed,
    canInteract,
    canStart,
    settingsOpen,
    originalOpen,
    initialize,
    chooseBuiltin,
    chooseUpload,
    openSettings,
    closeSettings,
    setCandidateConfig,
    requestStart,
    toggleOriginal,
    closeOriginal,
    commitSwap,
    selectSlot,
    beginPointer,
    movePointer,
    endPointer,
    cancelPointer,
    cancelInteraction,
    requestRestart,
    cancelConfirmation,
    confirmAction,
  }
}
