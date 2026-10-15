<script setup lang="ts">
import { computed } from 'vue'

import { getCorrectSlots } from '../puzzle/rules'
import type { PuzzleImageResource, PuzzleState, SlotIndex, TileId } from '../puzzle/types'

const props = defineProps<{
  state: PuzzleState
  imageResource: PuzzleImageResource
  selectedSlot: SlotIndex | null
  completed: boolean
  interactive: boolean
  showOriginal: boolean
}>()

const emit = defineEmits<{
  select: [slot: SlotIndex, sessionId: string]
}>()

const correctSlots = computed(() => new Set(getCorrectSlots(props.state.tiles)))
const boardStyle = computed(() => ({
  '--grid-size': props.state.gridSize,
  '--puzzle-image': `url("${props.imageResource.url}")`,
  '--slice-size': `${props.state.gridSize * 100}%`,
  aspectRatio: `${props.imageResource.image.width} / ${props.imageResource.image.height}`,
}))

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
  return `第 ${Math.floor(slot / size) + 1} 行，第 ${(slot % size) + 1} 列，图块 ${tile + 1}${correctSlots.value.has(slot) ? '，已归位' : ''}`
}
</script>

<template>
  <div
    class="puzzle-board"
    :class="{ 'is-complete': completed }"
    :style="boardStyle"
    role="group"
    aria-label="拼图棋盘"
    aria-describedby="puzzle-instructions"
  >
    <button
      v-for="(tile, slot) in state.tiles"
      :key="slot"
      type="button"
      class="puzzle-slot"
      :class="{
        'is-correct': correctSlots.has(slot),
        'is-selected': selectedSlot === slot,
        'has-right-edge': showRightEdge(slot),
        'has-bottom-edge': showBottomEdge(slot),
      }"
      :aria-label="slotLabel(slot, tile)"
      :aria-pressed="selectedSlot === slot"
      :aria-disabled="!interactive || correctSlots.has(slot)"
      :inert="showOriginal || completed"
      @click="emit('select', slot, state.sessionId)"
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
  </div>
</template>
