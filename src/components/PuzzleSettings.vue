<script setup lang="ts">
import { useId } from 'vue'

import { GRID_SIZES, IMAGE_MIME_TYPES } from '../puzzle/constants'
import { BUILTIN_IMAGES } from '../puzzle/images'
import type { BuiltinImageMetadata, PuzzleConfig, PuzzleImageResource } from '../puzzle/types'

const props = defineProps<{
  config: PuzzleConfig
  resource: PuzzleImageResource | null
  selectedImageId: string | null
  loading: boolean
  error: string
  canStart: boolean
  hasGame: boolean
}>()
const emit = defineEmits<{
  builtin: [metadata: BuiltinImageMetadata]
  upload: [file: File]
  config: [config: PuzzleConfig]
  start: [trigger: HTMLElement]
}>()
const id = useId()

function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload', file)
  input.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <fieldset>
      <legend class="mb-3 text-sm font-medium">选择图片</legend>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="image in BUILTIN_IMAGES" :key="image.id" class="min-w-0 cursor-pointer">
          <input
            class="peer sr-only"
            type="radio"
            :name="`${id}-image`"
            :value="image.id"
            :checked="selectedImageId === image.id"
            @click="emit('builtin', image)"
          />
          <span class="choice-option">{{ image.displayName }}</span>
        </label>
      </div>
    </fieldset>

    <div>
      <label :for="`${id}-upload`" class="mb-2 block text-sm font-medium">从设备选图</label>
      <input
        :id="`${id}-upload`"
        class="block w-full min-w-0 rounded-lg border border-outline bg-page p-2 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-outline file:px-3 file:py-2 file:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        type="file"
        :accept="IMAGE_MIME_TYPES.join(',')"
        @change="upload"
      />
      <p class="mt-2 text-xs leading-5 text-muted">
        图片仅在此浏览器中处理和保存。支持 JPEG、PNG、WebP，最大 10 MiB、2000 万像素。
      </p>
    </div>

    <figure class="min-w-0 rounded-lg border border-outline bg-page p-3" :aria-busy="loading">
      <img
        v-if="resource"
        class="mx-auto max-h-72 w-full object-contain"
        :src="resource.url"
        :width="resource.image.width"
        :height="resource.image.height"
        :alt="`${resource.image.displayName}，整图预览`"
        draggable="false"
      />
      <div v-else class="flex h-40 items-center justify-center text-sm text-muted">
        选择一张图片，预览完整画面
      </div>
      <figcaption v-if="resource" class="mt-2 text-center text-sm break-all text-muted">
        {{ resource.image.displayName }}
      </figcaption>
      <p v-if="loading" class="mt-3 text-center text-sm text-accent" role="status">正在准备图片…</p>
      <p v-if="error" class="mt-3 text-sm leading-6 text-success" role="alert">{{ error }}</p>
    </figure>

    <fieldset>
      <legend class="mb-3 text-sm font-medium">网格大小</legend>
      <div class="grid grid-cols-4 gap-2">
        <label v-for="size in GRID_SIZES" :key="size" class="cursor-pointer">
          <input
            class="peer sr-only"
            type="radio"
            :name="`${id}-grid`"
            :value="size"
            :checked="config.gridSize === size"
            @change="emit('config', { ...config, gridSize: size })"
          />
          <span class="choice-option">{{ size }} × {{ size }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-3 text-sm font-medium">开局方式</legend>
      <div class="grid grid-cols-2 gap-2">
        <label class="cursor-pointer">
          <input
            class="peer sr-only"
            type="radio"
            :name="`${id}-mode`"
            value="assisted"
            :checked="config.startMode === 'assisted'"
            @change="emit('config', { ...config, startMode: 'assisted' })"
          />
          <span class="choice-option">辅助开局</span>
        </label>
        <label class="cursor-pointer">
          <input
            class="peer sr-only"
            type="radio"
            :name="`${id}-mode`"
            value="random"
            :checked="config.startMode === 'random'"
            @change="emit('config', { ...config, startMode: 'random' })"
          />
          <span class="choice-option">随机开局</span>
        </label>
      </div>
      <p class="mt-2 text-xs leading-5 text-muted">
        {{
          config.startMode === 'assisted'
            ? '预留约四分之一图块归位，其余随机打乱。'
            : '全部图块随机打乱，也可能有图块恰好归位。'
        }}
      </p>
    </fieldset>
    <button
      class="action-button action-button-primary w-full"
      type="button"
      :disabled="!props.canStart"
      @click="emit('start', $event.currentTarget as HTMLElement)"
    >
      {{ hasGame ? '开始新局' : '开始拼图' }}
    </button>
  </div>
</template>
