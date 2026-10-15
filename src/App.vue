<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

import PuzzleBoard from './components/PuzzleBoard.vue'
import PuzzleSettings from './components/PuzzleSettings.vue'
import { usePuzzleSession } from './composables/usePuzzleSession'

const {
  state,
  imageResource,
  selectedSlot,
  candidateResource,
  candidateConfig,
  candidateImageId,
  loading,
  loadError,
  correctSlots,
  completed,
  canInteract,
  canStart,
  confirmation,
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
  selectSlot,
  requestRestart,
  cancelConfirmation,
  confirmAction,
} = usePuzzleSession()

const settingsDialog = useTemplateRef('settings-dialog')
const confirmationDialog = useTemplateRef('confirmation-dialog')
const settingsButton = useTemplateRef('settings-button')
const closeButton = useTemplateRef('close-button')
const cancelButton = useTemplateRef('cancel-button')
let settingsTrigger: HTMLElement | null = null
let confirmationTrigger: HTMLElement | null = null

function showSettings(event: MouseEvent) {
  settingsTrigger = event.currentTarget as HTMLElement
  openSettings()
}

function startFromSettings(trigger: HTMLElement) {
  confirmationTrigger = trigger
  requestStart()
}

function restart(event: MouseEvent) {
  confirmationTrigger = event.currentTarget as HTMLElement
  requestRestart()
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && originalOpen.value && !confirmation.value) closeOriginal()
}

onMounted(() => {
  window.addEventListener('keydown', handleEscape)
  void loadInitialImage()
})
onUnmounted(() => window.removeEventListener('keydown', handleEscape))

watch(
  () => settingsOpen.value && !!state.value,
  async (open) => {
    await nextTick()
    if (open) {
      settingsDialog.value?.showModal()
      closeButton.value?.focus()
    } else {
      settingsDialog.value?.close()
      settingsTrigger?.focus({ preventScroll: true })
    }
  },
)

watch(confirmation, async (action) => {
  await nextTick()
  if (action) {
    confirmationDialog.value?.showModal()
    cancelButton.value?.focus()
  } else {
    confirmationDialog.value?.close()
    const trigger = confirmationTrigger?.isConnected ? confirmationTrigger : settingsButton.value
    trigger?.focus({ preventScroll: true })
  }
})
</script>

<template>
  <main class="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
    <header class="mb-7 flex items-end justify-between gap-4">
      <div class="shrink-0">
        <p class="mb-2 text-xs font-semibold tracking-[0.24em] text-accent">PUZZLE</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">拼图</h1>
      </div>
      <p v-if="state" class="min-w-0 text-right text-sm leading-6 text-muted">
        <span class="line-clamp-2 break-all">{{ imageResource?.image.displayName }}</span>
        {{ state.gridSize }} × {{ state.gridSize }} ·
        {{ state.startMode === 'assisted' ? '辅助开局' : '随机开局' }}
      </p>
      <p v-else class="text-right text-sm text-muted">选一张图，慢慢拼好。</p>
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
        :show-original="originalOpen"
        @select="selectSlot"
      />

      <div v-if="completed" class="mt-6 text-center" role="status">
        <p class="text-xl font-semibold text-success">拼图完成</p>
        <p class="mt-1 text-sm text-muted">{{ state.moves }} 次交换，拼回完整画面。</p>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          v-if="!completed"
          class="action-button"
          type="button"
          :aria-pressed="originalOpen"
          @click="toggleOriginal"
        >
          {{ originalOpen ? '返回拼图' : '查看原图' }}
        </button>
        <button class="action-button" type="button" @click="restart">
          {{ completed ? '再来一局' : '重新打乱' }}
        </button>
        <button ref="settings-button" class="action-button" type="button" @click="showSettings">
          换张图片
        </button>
      </div>
      <p
        id="puzzle-instructions"
        class="mx-auto mt-5 max-w-md text-center text-sm leading-6 text-muted"
      >
        依次点选两块图即可交换，再点选中图块可取消。<br />归位图块变暗并锁定，拼好后整图亮起。
      </p>
    </template>

    <section
      v-else
      aria-label="开局设置"
      class="rounded-xl border border-outline bg-surface p-4 sm:p-6"
    >
      <PuzzleSettings
        :config="candidateConfig"
        :resource="candidateResource"
        :selected-image-id="candidateImageId"
        :loading="loading"
        :error="loadError"
        :can-start="canStart"
        :has-game="false"
        @builtin="chooseBuiltin"
        @upload="chooseUpload"
        @config="setCandidateConfig"
        @start="startFromSettings"
      />
    </section>

    <dialog
      ref="settings-dialog"
      class="puzzle-dialog settings-dialog rounded-xl border border-outline bg-surface p-4 text-ink shadow-2xl sm:p-6"
      aria-labelledby="settings-title"
      @cancel.prevent="closeSettings"
    >
      <div class="mb-6 flex items-center justify-between gap-3">
        <h2 id="settings-title" class="text-xl font-semibold">换张图片</h2>
        <button ref="close-button" class="action-button" type="button" @click="closeSettings">
          取消
        </button>
      </div>
      <PuzzleSettings
        v-if="settingsOpen && state"
        :config="candidateConfig"
        :resource="candidateResource"
        :selected-image-id="candidateImageId"
        :loading="loading"
        :error="loadError"
        :can-start="canStart"
        :has-game="true"
        @builtin="chooseBuiltin"
        @upload="chooseUpload"
        @config="setCandidateConfig"
        @start="startFromSettings"
      />
    </dialog>

    <dialog
      ref="confirmation-dialog"
      class="puzzle-dialog confirmation-dialog rounded-xl border border-outline bg-surface p-6 text-ink shadow-2xl"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      @cancel.prevent="cancelConfirmation"
    >
      <h2 id="confirmation-title" class="text-xl font-semibold">
        {{ confirmation === 'new-game' ? '开始新局？' : '重新打乱？' }}
      </h2>
      <p id="confirmation-description" class="mt-3 text-sm leading-6 text-muted">
        {{ confirmation === 'new-game' ? '开始新局将清除本局进度。' : '重新打乱将清除本局进度。' }}
      </p>
      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <button ref="cancel-button" class="action-button" type="button" @click="cancelConfirmation">
          取消
        </button>
        <button class="action-button action-button-primary" type="button" @click="confirmAction">
          {{ confirmation === 'new-game' ? '开始新局' : '重新打乱' }}
        </button>
      </div>
    </dialog>
  </main>
</template>
