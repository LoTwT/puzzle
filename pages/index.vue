<script setup lang="ts">
import type { CSSProperties } from "vue"

const puzzleRef = useTemplateRef("puzzleRef")

const { puzzle, puzzlePieces, loading } = usePuzzle("/ganyu.jpeg", 200)

const puzzleStyles = computed<CSSProperties>(() => ({
  gridTemplateColumns: `repeat(${puzzle.value.columns}, minmax(0, 1fr))`,
}))

const { result } = useSwap(puzzleRef, puzzlePieces, {
  animation: 150,
})
</script>

<template>
  <template v-if="loading">loading...</template>
  <template v-else>
    <div ref="puzzleRef" class="puzzle grid gap-1">
      <div v-for="piece in result" :key="piece.id" class="b-1 b-gray-300">
        <img :src="piece.base64" />
      </div>
    </div>
  </template>
</template>

<style scoped lang="scss">
.puzzle {
  grid-template-columns: v-bind("puzzleStyles.gridTemplateColumns");
  grid-auto-rows: 1fr;
}
</style>
