<script setup lang="ts">
import type { CSSProperties } from "vue"

const puzzleRef = useTemplateRef("puzzleRef")

const { puzzle, puzzlePieces, loading } = usePuzzle("/ganyu.jpeg", 400)

const puzzleStyles = computed<CSSProperties>(() => ({
  gridTemplateColumns: `repeat(${puzzle.value.columns}, minmax(0, ${puzzle.value.pieceSize}px))`,
}))

const DraggableClass = "piece-draggable"

const { result } = useSwap(puzzleRef, puzzlePieces, {
  animation: 150,
  draggable: `.${DraggableClass}`,
  onEnd: (e) => {
    const { oldIndex, newIndex } = e

    checkPiece(oldIndex!)
    checkPiece(newIndex!)
  },
})

function checkPiece(index: number) {
  const renderRow = Math.floor(index / puzzle.value.columns)
  const renderCol = index % puzzle.value.columns

  const isRestored = result.value[index].id === `${renderRow}-${renderCol}`

  result.value[index].restored = isRestored
}

watch(
  result,
  () => {
    result.value.forEach((_, index) => checkPiece(index))
  },
  {
    once: true,
  },
)

const isPuzzleRestored = computed(() =>
  result.value.every((piece) => piece.restored),
)
</script>

<template>
  <template v-if="loading">loading...</template>
  <template v-else>
    <div
      ref="puzzleRef"
      class="puzzle grid transition-all duration-1200"
      :class="[isPuzzleRestored ? 'gap-0 brightness-100' : 'gap-1']"
    >
      <div
        v-for="piece in result"
        :key="piece.id"
        :class="[
          piece.restored && !isPuzzleRestored
            ? 'brightness-30'
            : `brightness-100 ${DraggableClass}`,
          !isPuzzleRestored && 'b-1 b-gray-300',
        ]"
      >
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
