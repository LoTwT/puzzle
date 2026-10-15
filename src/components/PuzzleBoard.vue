<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

import { acceptsPointer, adjacentSlot, hitTestSlot, reachedDragThreshold } from '../puzzle/input'
import { getCorrectSlots } from '../puzzle/rules'
import type {
  BoardBounds,
  PointerGesture,
  PointerInput,
  PuzzleImageResource,
  PuzzleState,
  SlotIndex,
  TileId,
} from '../puzzle/types'

const props = defineProps<{
  state: PuzzleState
  imageResource: PuzzleImageResource
  selectedSlot: SlotIndex | null
  pointerGesture: PointerGesture | null
  completed: boolean
  interactive: boolean
  showOriginal: boolean
}>()

const emit = defineEmits<{
  select: [slot: SlotIndex, sessionId: string]
  pointerStart: [event: PointerInput, bounds: BoardBounds, sessionId: string]
  pointerMove: [event: PointerInput, bounds: BoardBounds]
  pointerEnd: [event: PointerInput, bounds: BoardBounds]
  cancelPointer: [pointerId?: number]
  cancelInteraction: []
}>()

const board = useTemplateRef('board')
const focusedSlot = shallowRef<SlotIndex>(0)
let capturedPointer: number | null = null
let moveFrame: number | null = null
let pendingMove: PointerEvent | null = null
let resizeObserver: ResizeObserver | undefined
const dragging = computed(() =>
  props.pointerGesture?.phase === 'dragging' ? props.pointerGesture : null,
)
const correctSlots = computed(() => new Set(getCorrectSlots(props.state.tiles)))
const boardStyle = computed(() => ({
  '--grid-size': props.state.gridSize,
  '--puzzle-image': `url("${props.imageResource.url}")`,
  '--slice-size': `${props.state.gridSize * 100}%`,
  aspectRatio: `${props.imageResource.image.width} / ${props.imageResource.image.height}`,
}))

const floatingStyle = computed(() => {
  const gesture = dragging.value
  if (!gesture) return {}
  return {
    width: `${gesture.width}px`,
    height: `${gesture.height}px`,
    transform: `translate3d(${gesture.x - gesture.offsetX}px, ${gesture.y - gesture.offsetY}px, 0)`,
    ...tileStyle(props.state.tiles[gesture.sourceSlot]!),
  }
})

// 棋盘使用外部 outline，无 padding/border；其 DOMRect 正好是图片内容区域。
function bounds(): BoardBounds {
  return board.value!.getBoundingClientRect()
}

function focusSlot(slot: SlotIndex) {
  focusedSlot.value = slot
  board.value
    ?.querySelectorAll<HTMLButtonElement>('.puzzle-slot')
    [slot]?.focus({ preventScroll: true })
}

function clearMoveFrame() {
  if (moveFrame !== null) cancelAnimationFrame(moveFrame)
  moveFrame = null
  pendingMove = null
}

function releaseCapture() {
  clearMoveFrame()
  const pointer = capturedPointer
  capturedPointer = null
  if (pointer !== null && board.value?.hasPointerCapture(pointer))
    board.value.releasePointerCapture(pointer)
}

function onPointerDown(event: PointerEvent) {
  if (!props.interactive || props.pointerGesture || !acceptsPointer(event)) return
  const rect = bounds()
  const slot = hitTestSlot(event.clientX, event.clientY, rect, props.state.gridSize)
  if (slot === null) return
  // 自行定位焦点，避免长图点选时浏览器滚动到格位中心。
  event.preventDefault()
  focusSlot(slot)
  if (correctSlots.value.has(slot)) return
  emit('pointerStart', event, rect, props.state.sessionId)
  try {
    board.value!.setPointerCapture(event.pointerId)
    capturedPointer = event.pointerId
  } catch {
    emit('cancelPointer', event.pointerId)
  }
}

function onPointerMove(event: PointerEvent) {
  const gesture = props.pointerGesture
  if (!gesture || event.pointerId !== capturedPointer) return
  // 阈值跨越即时记录，防止同一帧先越过阈值再返回被误判为点选。
  if (
    gesture.phase === 'pressed' &&
    reachedDragThreshold(event.clientX, event.clientY, gesture.startX, gesture.startY)
  ) {
    clearMoveFrame()
    emit('pointerMove', event, bounds())
    return
  }
  pendingMove = event
  if (moveFrame === null)
    moveFrame = requestAnimationFrame(() => {
      moveFrame = null
      if (pendingMove) emit('pointerMove', pendingMove, bounds())
      pendingMove = null
    })
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== capturedPointer) return
  const rect = bounds()
  if (pendingMove) emit('pointerMove', pendingMove, rect)
  clearMoveFrame()
  emit('pointerEnd', event, rect)
  releaseCapture()
  const slot = hitTestSlot(event.clientX, event.clientY, rect, props.state.gridSize)
  if (slot !== null) focusSlot(slot)
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== capturedPointer) return
  emit('cancelPointer', event.pointerId)
  releaseCapture()
}

function cancelForGeometryChange() {
  emit('cancelPointer')
}

function cancelForBlur() {
  emit('cancelInteraction')
}

function onVisibilityChange() {
  if (document.hidden) cancelForBlur()
}

function onKeydown(event: KeyboardEvent, slot: SlotIndex) {
  if (props.showOriginal) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancelInteraction')
  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    if (!props.pointerGesture) focusSlot(adjacentSlot(slot, event.key, props.state.gridSize))
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!event.repeat && props.interactive && !props.pointerGesture)
      emit('select', slot, props.state.sessionId)
  }
}

function onClick(event: MouseEvent, slot: SlotIndex) {
  // 指针释放已由 pointerup 处理；仅保留辅助技术的无指针激活。
  if (
    event.detail === 0 &&
    !(event instanceof PointerEvent && event.pointerType) &&
    props.interactive &&
    !props.pointerGesture
  ) {
    focusSlot(slot)
    emit('select', slot, props.state.sessionId)
  }
}

watch(
  () => props.pointerGesture,
  (gesture) => {
    if (!gesture) releaseCapture()
  },
)
watch(
  () => props.state.sessionId,
  () => {
    releaseCapture()
    focusedSlot.value = 0
  },
)

onMounted(() => {
  let previous = bounds()
  resizeObserver = new ResizeObserver(() => {
    const current = bounds()
    if (current.width !== previous.width || current.height !== previous.height)
      cancelForGeometryChange()
    previous = current
  })
  resizeObserver.observe(board.value!)
  window.addEventListener('scroll', cancelForGeometryChange, true)
  window.addEventListener('resize', cancelForGeometryChange)
  window.addEventListener('orientationchange', cancelForGeometryChange)
  window.addEventListener('blur', cancelForBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  releaseCapture()
  resizeObserver?.disconnect()
  window.removeEventListener('scroll', cancelForGeometryChange, true)
  window.removeEventListener('resize', cancelForGeometryChange)
  window.removeEventListener('orientationchange', cancelForGeometryChange)
  window.removeEventListener('blur', cancelForBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

function tileStyle(tile: TileId) {
  const size = props.state.gridSize
  return {
    backgroundPosition: `${((tile % size) / (size - 1)) * 100}% ${(Math.floor(tile / size) / (size - 1)) * 100}%`,
  }
}

function showRightEdge(slot: SlotIndex): boolean {
  return (
    (slot + 1) % props.state.gridSize !== 0 &&
    !(correctSlots.value.has(slot) && correctSlots.value.has(slot + 1))
  )
}

function showBottomEdge(slot: SlotIndex): boolean {
  return (
    slot + props.state.gridSize < props.state.tiles.length &&
    !(correctSlots.value.has(slot) && correctSlots.value.has(slot + props.state.gridSize))
  )
}

function slotLabel(slot: SlotIndex, tile: TileId): string {
  const size = props.state.gridSize
  return `第 ${Math.floor(slot / size) + 1} 行，第 ${(slot % size) + 1} 列，图块 ${tile + 1}，${correctSlots.value.has(slot) ? '已归位' : '未归位'}`
}
</script>

<template>
  <div class="relative">
    <!-- 给侧边留白独立命中区，防止触屏将外侧滑动修正到邻近的图块按钮。 -->
    <div
      class="absolute inset-y-0 -left-4 w-4 touch-pan-y touch-pinch-zoom"
      aria-hidden="true"
      @click.stop
    ></div>
    <div
      class="absolute inset-y-0 -right-4 w-4 touch-pan-y touch-pinch-zoom"
      aria-hidden="true"
      @click.stop
    ></div>
    <div
      ref="board"
      class="puzzle-board"
      :class="{ 'is-complete': completed }"
      :style="boardStyle"
      role="group"
      aria-label="拼图棋盘"
      aria-describedby="puzzle-instructions"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
      @dragstart.prevent
      @selectstart.prevent
    >
      <button
        v-for="(tile, slot) in state.tiles"
        :key="slot"
        type="button"
        class="puzzle-slot"
        :class="{
          'is-correct': correctSlots.has(slot),
          'is-selected': selectedSlot === slot,
          'is-drag-source': dragging?.sourceSlot === slot,
          'is-drop-target': dragging?.targetSlot === slot,
          'has-right-edge': showRightEdge(slot),
          'has-bottom-edge': showBottomEdge(slot),
        }"
        :aria-label="slotLabel(slot, tile)"
        :aria-pressed="selectedSlot === slot"
        :aria-disabled="!interactive || correctSlots.has(slot)"
        :inert="showOriginal"
        :tabindex="focusedSlot === slot ? 0 : -1"
        @focus="focusedSlot = slot"
        @keydown="onKeydown($event, slot)"
        @click.prevent="onClick($event, slot)"
      >
        <span class="puzzle-tile-image" :style="tileStyle(tile)" aria-hidden="true"></span>
      </button>
      <img
        v-if="showOriginal || completed"
        class="puzzle-full-image"
        :src="imageResource.url"
        :alt="`${imageResource.image.displayName}，${completed ? '拼图完成' : '完整图片'}`"
        draggable="false"
      />
      <div
        v-if="dragging"
        class="pointer-events-none fixed inset-0 z-30 overflow-hidden"
        aria-hidden="true"
      >
        <div class="puzzle-floating-tile" :style="floatingStyle"></div>
      </div>
    </div>
  </div>
</template>
