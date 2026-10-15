<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'

import PuzzleBoard from './components/PuzzleBoard.vue'
import { usePuzzleSession } from './composables/usePuzzleSession'

const {
  state,
  imageResource,
  selectedSlot,
  loading,
  loadError,
  correctSlots,
  completed,
  canInteract,
  restartConfirmationOpen,
  loadInitialImage,
  selectSlot,
  requestRestart,
  cancelRestart,
  confirmRestart,
} = usePuzzleSession()

const restartDialog = useTemplateRef('restart-dialog')
const restartButton = useTemplateRef('restart-button')

onMounted(loadInitialImage)

watch(restartConfirmationOpen, async (open) => {
  if (open) {
    restartDialog.value?.showModal()
  } else {
    restartDialog.value?.close()
    await nextTick()
    restartButton.value?.focus()
  }
})
</script>

<template>
  <main class="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
    <header class="mb-7 flex items-end justify-between gap-4">
      <div>
        <p class="mb-2 text-xs font-semibold tracking-[0.24em] text-accent">PUZZLE</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">拼图</h1>
      </div>
      <p v-if="state" class="text-right text-sm leading-6 text-muted">
        {{ imageResource?.image.displayName }}<br />
        {{ state.gridSize }} × {{ state.gridSize }} ·
        {{ state.startMode === 'assisted' ? '辅助开局' : '随机开局' }}
      </p>
    </header>

    <template v-if="state && imageResource">
      <div class="mb-5">
        <div
          class="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>
            已归位
            <span class="ml-1 text-lg font-semibold tabular-nums">{{ correctSlots.length }}</span
            ><span class="text-muted"> / {{ state.tiles.length }}</span>
          </p>
          <p class="text-muted">
            交换 <span class="font-medium text-ink tabular-nums">{{ state.moves }}</span> 次
          </p>
        </div>
        <progress
          class="puzzle-progress"
          :value="correctSlots.length"
          :max="state.tiles.length"
          aria-label="归位进度"
        ></progress>
      </div>

      <PuzzleBoard
        :state="state"
        :image-resource="imageResource"
        :selected-slot="selectedSlot"
        :completed="completed"
        :interactive="canInteract"
        @select="selectSlot"
      />

      <div v-if="completed" class="mt-6 text-center" role="status">
        <p class="text-xl font-semibold text-success">拼图完成</p>
        <p class="mt-1 text-sm text-muted">{{ state.moves }} 次交换，拼回完整画面。</p>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button ref="restart-button" class="action-button" type="button" @click="requestRestart">
          {{ completed ? '再来一局' : '重新打乱' }}
        </button>
      </div>
      <p
        id="puzzle-instructions"
        class="mx-auto mt-5 max-w-md text-center text-sm leading-6 text-muted"
      >
        依次点选两块图即可交换，再点选中图块可取消。<br />
        归位图块变暗并锁定，拼好后整图亮起。
      </p>
    </template>

    <div
      v-else
      class="flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border border-outline bg-surface"
      :aria-busy="loading"
    >
      <p v-if="loadError" role="alert" class="text-muted">{{ loadError }}</p>
      <p v-else role="status" class="text-muted">正在准备图片…</p>
      <button v-if="loadError" class="action-button" type="button" @click="loadInitialImage">
        重新加载
      </button>
    </div>

    <dialog
      ref="restart-dialog"
      class="restart-dialog rounded-xl border border-outline bg-surface p-6 text-ink shadow-2xl"
      aria-labelledby="restart-title"
      aria-describedby="restart-description"
      @cancel.prevent="cancelRestart"
    >
      <h2 id="restart-title" class="text-xl font-semibold">重新打乱？</h2>
      <p id="restart-description" class="mt-3 text-sm leading-6 text-muted">
        重新打乱将清除本局进度。
      </p>
      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <button class="action-button" type="button" autofocus @click="cancelRestart">取消</button>
        <button class="action-button action-button-primary" type="button" @click="confirmRestart">
          重新打乱
        </button>
      </div>
    </dialog>
  </main>
</template>
