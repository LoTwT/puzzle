<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

import { MOTION } from '../puzzle/constants'
import { acceptsPointer, adjacentSlot, hitTestSlot, reachedDragThreshold } from '../puzzle/input'
import {
  createMotionGroup,
  type BoardMotion,
  type MotionOutcome,
  type PuzzlePhase,
} from '../puzzle/motion'
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
  motion: BoardMotion | null
  reducedMotion: boolean
  phase: PuzzlePhase
  covered: boolean
}>()

const emit = defineEmits<{
  select: [slot: SlotIndex, sessionId: string]
  pointerStart: [event: PointerInput, bounds: BoardBounds, sessionId: string]
  pointerMove: [event: PointerInput, bounds: BoardBounds]
  pointerEnd: [event: PointerInput, bounds: BoardBounds]
  cancelPointer: [pointerId?: number]
  cancelInteraction: []
  finishMotion: [id: number, sessionId: string]
  settleMotion: [id: number, sessionId: string]
}>()

const board = useTemplateRef('board')
const movingLayer = useTemplateRef('moving-layer')
const fullImage = useTemplateRef('full-image')
const completionFrame = useTemplateRef('completion-frame')
const sweep = useTemplateRef('sweep')
const focusedSlot = shallowRef<SlotIndex>(0)
let capturedPointer: number | null = null
let moveFrame: number | null = null
let pendingMove: PointerEvent | null = null
let resizeObserver: ResizeObserver | undefined
const dragging = computed(() =>
  props.pointerGesture?.phase === 'dragging' ? props.pointerGesture : null,
)
const correctSlots = computed(() => new Set(getCorrectSlots(props.state.tiles)))
const visibleCorrectSlots = computed(() => {
  const slots = new Set(correctSlots.value)
  if (props.motion?.kind === 'swapping')
    for (const slot of props.motion.newlyCorrect) slots.delete(slot)
  return slots
})
const hiddenSlots = computed(() =>
  props.motion?.kind === 'swapping'
    ? [props.motion.swap.sourceSlot, props.motion.swap.targetSlot]
    : props.motion?.kind === 'returning'
      ? [props.motion.gesture.sourceSlot]
      : [],
)
const boardStyle = computed(() => ({
  '--grid-size': props.state.gridSize,
  '--puzzle-image': `url("${props.imageResource.url}")`,
  '--slice-size': `${props.state.gridSize * 100}%`,
  aspectRatio: `${props.imageResource.image.width} / ${props.imageResource.image.height}`,
}))

const placement = createMotionGroup()
const pickup = createMotionGroup()
const localEffects = createMotionGroup()
let floating: HTMLDivElement | null = null
let drawingFrame: number | null = null
let motionEpoch = 0

const translate = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`
const tileImages = () => board.value!.querySelectorAll<HTMLElement>('.puzzle-tile-image')

function createMovingTile(tile: TileId, width: number, height: number, lifted = false) {
  const node = document.createElement('div')
  node.className = lifted ? 'puzzle-floating-tile' : 'puzzle-moving-tile'
  Object.assign(node.style, { width: `${width}px`, height: `${height}px` })
  const image = document.createElement('div')
  image.className = 'puzzle-moving-image'
  Object.assign(image.style, tileStyle(tile))
  node.append(image)
  movingLayer.value!.append(node)
  return node
}

function positionFloating(gesture: PointerGesture, tile: TileId) {
  if (!floating) {
    floating = createMovingTile(tile, gesture.width, gesture.height, true)
    const image = floating.firstElementChild as HTMLElement
    image.style.transformOrigin = `${gesture.offsetX}px ${gesture.offsetY}px`
    if (!props.reducedMotion) {
      image.style.scale = String(MOTION.pickupScale)
      pickup.animate(image, [{ scale: '1' }, { scale: String(MOTION.pickupScale) }], {
        duration: MOTION.pickup,
        easing: MOTION.moveEasing,
      })
    }
  }
  floating.style.transform = translate(gesture.x - gesture.offsetX, gesture.y - gesture.offsetY)
  return floating
}

function clearDrawingFrame() {
  if (drawingFrame !== null) cancelAnimationFrame(drawingFrame)
  drawingFrame = null
}

function clearMovingTiles() {
  clearDrawingFrame()
  pickup.cancel()
  movingLayer.value?.replaceChildren()
  floating = null
}

function stopPlacement() {
  motionEpoch++
  placement.cancel()
  clearMovingTiles()
}

function settleVisuals() {
  stopPlacement()
  localEffects.cancel()
  const current = props.motion
  if (current) emit('settleMotion', current.id, current.sessionId)
}

function playCorrectEffects(slots: readonly SlotIndex[]) {
  const images = tileImages()
  for (const slot of slots) {
    const image = images[slot]!
    const button = image.parentElement!
    const glow = button.querySelector<HTMLElement>('.puzzle-correct-glow')!
    button.dataset.correctEffect = 'true'
    localEffects.animate(
      image,
      [
        { filter: 'brightness(var(--tile-normal-brightness))' },
        { filter: 'brightness(var(--tile-correct-brightness))' },
      ],
      { duration: MOTION.correct, easing: MOTION.opacityEasing },
    )
    localEffects.animate(
      glow,
      [{ opacity: 0.15 }, { opacity: 1, offset: 0.28 }, { opacity: 0 }],
      { duration: MOTION.correct, easing: MOTION.opacityEasing },
      () => {
        delete button.dataset.correctEffect
      },
    )
  }
}

function playMotion(current: BoardMotion) {
  const epoch = ++motionEpoch
  let settled = false
  placement.cancel()
  clearDrawingFrame()
  if (current.kind !== 'swapping' && current.kind !== 'returning') clearMovingTiles()
  if (
    (current.kind !== 'swapping' && current.kind !== 'returning') ||
    (current.kind === 'swapping' && current.completes)
  )
    localEffects.cancel()
  const done = (outcome: MotionOutcome) => {
    if (settled || epoch !== motionEpoch || props.motion !== current) return
    settled = true
    clearMovingTiles()
    if (outcome === 'finished' && current.kind === 'swapping' && !current.completes)
      playCorrectEffects(current.newlyCorrect)
    if (outcome === 'finished') emit('finishMotion', current.id, current.sessionId)
    else emit('settleMotion', current.id, current.sessionId)
  }
  if (props.reducedMotion) {
    done('cancelled')
    return
  }
  if (current.kind === 'entering') {
    placement.animate(
      board.value!,
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: MOTION.enter,
        easing: MOTION.opacityEasing,
      },
      done,
    )
  } else if (current.kind === 'original-in' || current.kind === 'original-out') {
    placement.animate(
      fullImage.value!,
      [
        { opacity: current.kind === 'original-in' ? 0 : 1 },
        { opacity: current.kind === 'original-in' ? 1 : 0 },
      ],
      { duration: MOTION.original, easing: MOTION.opacityEasing },
      done,
    )
  } else if (current.kind === 'completing') {
    tileImages().forEach((image, slot) => {
      placement.animate(
        image,
        [
          {
            filter: `brightness(var(--tile-${current.newlyCorrect.includes(slot) ? 'normal' : 'correct'}-brightness))`,
          },
          { filter: 'brightness(var(--tile-normal-brightness))' },
        ],
        { duration: MOTION.complete, easing: MOTION.opacityEasing },
      )
    })
    placement.animate(
      sweep.value!,
      [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }],
      { duration: MOTION.complete, easing: MOTION.moveEasing },
    )
    placement.animate(
      sweep.value!,
      [{ opacity: 0 }, { opacity: 0.45, offset: 0.2 }, { opacity: 0 }],
      { duration: MOTION.complete, easing: MOTION.opacityEasing },
    )
    placement.animate(
      completionFrame.value!,
      [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }],
      { duration: MOTION.complete, easing: MOTION.opacityEasing },
      done,
    )
  } else if (current.kind === 'swapping' || current.kind === 'returning') {
    const rect = bounds()
    const width = rect.width / props.state.gridSize
    const height = rect.height / props.state.gridSize
    const position = (slot: SlotIndex) =>
      translate(
        rect.left + (slot % props.state.gridSize) * width,
        rect.top + Math.floor(slot / props.state.gridSize) * height,
      )
    const sourceSlot =
      current.kind === 'swapping' ? current.swap.sourceSlot : current.gesture.sourceSlot
    const sourceTile = current.kind === 'swapping' ? current.sourceTile : current.tile
    const source = current.gesture
      ? positionFloating(current.gesture, sourceTile)
      : createMovingTile(sourceTile, width, height)
    const from = current.gesture ? source.style.transform : position(sourceSlot)
    const to = position(current.kind === 'swapping' ? current.swap.targetSlot : sourceSlot)
    const sourceImage = source.firstElementChild as HTMLElement
    const scale = getComputedStyle(sourceImage).scale
    pickup.cancel()
    sourceImage.style.scale = '1'
    source.style.transform = to
    const duration = current.kind === 'swapping' ? MOTION.swap : MOTION.return
    const options = { duration, easing: MOTION.moveEasing }
    placement.animate(sourceImage, [{ scale }, { scale: '1' }], options)
    let remaining = current.kind === 'swapping' ? 2 : 1
    const landed = (outcome: MotionOutcome) => {
      if (outcome === 'cancelled') done(outcome)
      else if (--remaining === 0) done('finished')
    }
    placement.animate(source, [{ transform: from }, { transform: to }], options, landed)
    if (current.kind === 'swapping') {
      const target = createMovingTile(current.targetTile, width, height)
      target.style.transform = position(sourceSlot)
      placement.animate(
        target,
        [{ transform: position(current.swap.targetSlot) }, { transform: position(sourceSlot) }],
        options,
        landed,
      )
    }
  }
}

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
  settleVisuals()
}

function cancelForBlur() {
  emit('cancelInteraction')
  settleVisuals()
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
    if (!props.pointerGesture && !props.motion)
      focusSlot(adjacentSlot(slot, event.key, props.state.gridSize))
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
  dragging,
  (gesture) => {
    if (props.motion) return
    if (!gesture) clearMovingTiles()
    else if (drawingFrame === null)
      drawingFrame = requestAnimationFrame(() => {
        drawingFrame = null
        const current = dragging.value
        if (current && !props.motion)
          positionFloating(current, props.state.tiles[current.sourceSlot]!)
      })
  },
  { flush: 'post' },
)
watch(
  () => props.motion,
  (current) => {
    if (current) playMotion(current)
    else stopPlacement()
  },
  { flush: 'post' },
)
watch(
  () => props.reducedMotion,
  (reduced) => {
    if (reduced) {
      settleVisuals()
      if (dragging.value)
        positionFloating(dragging.value, props.state.tiles[dragging.value.sourceSlot]!)
    }
  },
  { flush: 'post' },
)
watch(
  () => props.covered,
  (covered) => {
    if (covered) localEffects.cancel()
  },
)
watch(
  () => props.state.sessionId,
  () => {
    releaseCapture()
    stopPlacement()
    localEffects.cancel()
    focusedSlot.value = 0
  },
  { flush: 'pre' },
)

onMounted(() => {
  if (props.motion) playMotion(props.motion)
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

onBeforeUnmount(() => {
  releaseCapture()
  stopPlacement()
  localEffects.cancel()
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
    !(visibleCorrectSlots.value.has(slot) && visibleCorrectSlots.value.has(slot + 1))
  )
}

function showBottomEdge(slot: SlotIndex): boolean {
  return (
    slot + props.state.gridSize < props.state.tiles.length &&
    !(
      visibleCorrectSlots.value.has(slot) &&
      visibleCorrectSlots.value.has(slot + props.state.gridSize)
    )
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
      :class="{ 'is-complete': completed, 'is-completing': motion?.kind === 'completing' }"
      v-bind="{ 'data-phase': phase }"
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
          'is-correct': visibleCorrectSlots.has(slot),
          'is-moving': hiddenSlots.includes(slot),
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
        <span class="puzzle-correct-glow" aria-hidden="true"></span>
      </button>
      <img
        v-if="showOriginal || completed"
        ref="full-image"
        class="puzzle-full-image"
        :src="imageResource.url"
        :alt="`${imageResource.image.displayName}，${completed ? '拼图完成' : '完整图片'}`"
        draggable="false"
      />
      <div class="puzzle-completion-effects" aria-hidden="true">
        <div ref="sweep" class="puzzle-sweep"></div>
      </div>
      <div ref="completion-frame" class="puzzle-completion-frame" aria-hidden="true"></div>
      <div
        ref="moving-layer"
        class="pointer-events-none fixed inset-0 z-30 overflow-hidden"
        aria-hidden="true"
      ></div>
    </div>
  </div>
</template>
