<script setup lang="ts">
import type { CSSProperties } from "vue"

const pieceSize = ref<number>()

const puzzleRef = useTemplateRef("puzzleRef")

const { puzzle, puzzlePieces, loading, refresh } = usePuzzle(
  "/ganyu.jpeg",
  pieceSize,
)

const puzzleStyles = computed<CSSProperties>(() => ({
  gridTemplateColumns: `repeat(${puzzle.value.columns}, minmax(0, ${puzzle.value.pieceSize}px))`,
}))

const DraggableClass = "piece-draggable"

const { result, reset } = useSwap(puzzleRef, puzzlePieces, {
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

watch(result, () => {
  result.value.forEach((_, index) => checkPiece(index))
})

const isPuzzleRestored = computed(() =>
  result.value.every((piece) => piece.restored),
)
</script>

<template>
  <!-- Puzzle -->
  <template v-if="loading">loading...</template>
  <template v-else>
    <div
      ref="puzzleRef"
      class="puzzle grid transition-all duration-1200"
      :class="[isPuzzleRestored ? 'gap-0' : 'gap-1']"
    >
      <div
        v-for="piece in result"
        :key="piece.id"
        class="transition-all duration-1200"
        :class="[
          piece.restored && 'brightness-30',
          !isPuzzleRestored && 'b-1 b-gray-300',
          !(piece.restored || isPuzzleRestored) && DraggableClass,
          isPuzzleRestored && 'brightness-100!',
        ]"
      >
        <img :src="piece.base64" />
      </div>
    </div>
  </template>

  <!-- GamePad -->
  <div v-if="!loading" class="mt-8 flex items-center gap-2">
    <div class="flex gap-1">
      <div>piece size:</div>
      <select
        id="piece-size"
        v-model="pieceSize"
        name="piece-size"
        class="b-1 b-black rounded-md text-lg"
      >
        <option :value="undefined">auto</option>
        <option :value="100">100</option>
        <option :value="200">200</option>
        <option :value="400">400</option>
      </select>
    </div>

    <BitButton @click="reset">
      <div class="min-w-16">Reset</div>
    </BitButton>
    <BitButton @click="refresh">
      <div class="min-w-16">Refresh</div>
    </BitButton>
  </div>
</template>

<style scoped lang="scss">
.puzzle {
  grid-template-columns: v-bind("puzzleStyles.gridTemplateColumns");
  grid-auto-rows: 1fr;
}
</style>
