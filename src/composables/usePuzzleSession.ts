import { computed, nextTick, onScopeDispose, shallowRef } from 'vue'

import { DEFAULT_GRID_SIZE, DEFAULT_START_MODE } from '../puzzle/constants'
import {
  GEOMETRY_IMAGE,
  imageErrorMessage,
  loadBuiltinImage,
  loadUploadedImage,
} from '../puzzle/images'
import {
  applySwap,
  createPuzzle,
  getCorrectSlots,
  isComplete,
  isSlotLocked,
  isValidSlot,
} from '../puzzle/rules'
import type {
  BuiltinImageMetadata,
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
  let imageRequest = 0
  let disposed = false

  const correctSlots = computed(() => getCorrectSlots(state.value?.tiles ?? []))
  const completed = computed(() => isComplete(state.value?.tiles ?? []))
  const settingsOpen = computed(() => overlay.value === 'settings')
  const originalOpen = computed(() => overlay.value === 'original')
  const canInteract = computed(
    () =>
      !disposed &&
      state.value !== null &&
      !completed.value &&
      !overlay.value &&
      !confirmation.value,
  )
  const canStart = computed(
    () =>
      !disposed &&
      settingsOpen.value &&
      !!candidateResource.value &&
      !loading.value &&
      !loadError.value &&
      !confirmation.value,
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

  function startPuzzle(config: PuzzleConfig) {
    invalidateImageRequest()
    state.value = createPuzzle({ ...config, sessionId: crypto.randomUUID() })
    selectedSlot.value = null
    overlay.value = null
    confirmation.value = null
  }

  async function prepareImage(id: string | null, load: () => Promise<PuzzleImageResource>) {
    if (disposed || !settingsOpen.value || confirmation.value) return
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
    if (disposed || !settingsOpen.value || confirmation.value) return Promise.resolve()
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
    if (disposed || !state.value || confirmation.value || settingsOpen.value) return
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
    if (settingsOpen.value && !confirmation.value) candidateConfig.value = { ...config }
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
    if (disposed || !state.value || completed.value || settingsOpen.value || confirmation.value)
      return
    selectedSlot.value = null
    overlay.value = originalOpen.value ? null : 'original'
  }

  function closeOriginal() {
    if (originalOpen.value) overlay.value = null
  }

  /** 所有输入共用此入口；先提交局面，再由视图读取最终状态。 */
  function commitSwap(request: SwapRequest): boolean {
    const current = state.value
    if (
      disposed ||
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
      disposed ||
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
    if (disposed || !state.value || settingsOpen.value || confirmation.value) return
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
    disposed = true
    invalidateImageRequest()
    for (const resource of new Set([imageResource.value, candidateResource.value]))
      resource?.release()
  })

  return {
    state: computed(() => state.value),
    imageResource: computed(() => imageResource.value),
    selectedSlot: computed(() => selectedSlot.value),
    candidateResource: computed(() => candidateResource.value),
    candidateConfig: computed(() => candidateConfig.value),
    candidateImageId: computed(() => candidateImageId.value),
    loading: computed(() => loading.value),
    loadError: computed(() => loadError.value),
    confirmation: computed(() => confirmation.value),
    correctSlots,
    completed,
    canInteract,
    canStart,
    settingsOpen,
    originalOpen,
    loadInitialImage,
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
    requestRestart,
    cancelConfirmation,
    confirmAction,
  }
}
