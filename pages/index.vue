<script setup lang="ts">
import type { CSSProperties } from "vue"
import { useElementSize, useWindowSize } from "@vueuse/core"

interface PuzzleImage {
  kind: "sample" | "upload"
  name: string
  url: string
}

interface ImageInfo {
  width: number
  height: number
}

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

const sampleImageUrl = "/sample-puzzle.svg"
const maxUploadBytes = 12 * 1024 * 1024

const difficulties = [
  { key: "easy", label: "简单", helper: "3×3", gridSize: 3 },
  { key: "medium", label: "中等", helper: "4×4", gridSize: 4 },
  { key: "hard", label: "困难", helper: "6×6", gridSize: 6 },
] as const

type DifficultyKey = (typeof difficulties)[number]["key"]

const selectedImage = ref<PuzzleImage | null>(null)
const activeImage = ref<PuzzleImage>({
  kind: "sample",
  name: "安全示例图",
  url: sampleImageUrl,
})
const uploadedObjectUrl = ref<string | null>(null)
const imageInfo = ref<ImageInfo | null>(null)
const imageError = ref("")
const isPlaying = ref(false)
const isDragging = ref(false)
const difficulty = ref<DifficultyKey>("medium")
const fitMode = ref<PuzzleFitMode>("contain")
const pendingObjectUrlRevokeTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>()

const puzzleRef = useTemplateRef("puzzleRef")
const boardSlotRef = useTemplateRef<HTMLElement>("boardSlotRef")
const fileInputRef = useTemplateRef<HTMLInputElement>("fileInputRef")
const { width: windowWidth, height: windowHeight } = useWindowSize()
const { width: boardSlotWidth, height: boardSlotHeight } =
  useElementSize(boardSlotRef)

const activeDifficulty = computed(
  () =>
    difficulties.find((item) => item.key === difficulty.value) ??
    difficulties[1],
)

const shouldOfferCrop = computed(() => {
  if (!imageInfo.value) return false

  const aspectRatio = imageInfo.value.width / imageInfo.value.height
  return aspectRatio >= 2.35 || aspectRatio <= 0.42
})

watch(shouldOfferCrop, (next) => {
  if (!next) fitMode.value = "contain"
})

const puzzleUrl = computed(() => activeImage.value.url)
const puzzleGridSize = computed(() => activeDifficulty.value.gridSize)

const {
  puzzle,
  puzzlePieces,
  loading,
  error,
  refresh: shufflePuzzle,
} = usePuzzle(puzzleUrl, puzzleGridSize, fitMode)

const puzzleBoardSize = computed(() => {
  const fallbackWidth = Math.min(Math.max(windowWidth.value - 40, 240), 760)
  const fallbackHeight = Math.max(windowHeight.value - 240, 220)
  const maxWidth = Math.min(boardSlotWidth.value || fallbackWidth, 760)
  const maxHeight = boardSlotHeight.value || fallbackHeight
  const aspectRatio = puzzle.value.aspectRatio || 16 / 9
  let width = maxWidth
  let height = width / aspectRatio

  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }

  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  }
})

const puzzleStyles = computed<StyleWithVars>(() => ({
  "gridTemplateColumns": `repeat(${puzzle.value.columns}, minmax(0, 1fr))`,
  "aspectRatio": `${puzzle.value.aspectRatio}`,
  "inlineSize": `${puzzleBoardSize.value.width}px`,
  "blockSize": `${puzzleBoardSize.value.height}px`,
  "--puzzle-source": toCssUrl(puzzle.value.sourceUrl),
  "--puzzle-bg-size": `${puzzle.value.columns * 100}% ${
    puzzle.value.rows * 100
  }%`,
}))

const minimumPlayablePieceSize = 40

const showSmallPieceWarning = computed(() => {
  const minPieceSize = Math.min(
    puzzleBoardSize.value.width / puzzle.value.columns,
    puzzleBoardSize.value.height / puzzle.value.rows,
  )

  return minPieceSize > 0 && minPieceSize < minimumPlayablePieceSize
})

const previewAspectRatio = computed(() => {
  if (!imageInfo.value) return 16 / 9
  if (fitMode.value === "crop") {
    const sourceAspect = imageInfo.value.width / imageInfo.value.height
    return sourceAspect >= 1 ? 16 / 9 : 4 / 5
  }

  return imageInfo.value.width / imageInfo.value.height
})

const previewImageClass = computed(() =>
  fitMode.value === "crop" ? "object-cover" : "object-contain",
)

const previewStyles = computed<CSSProperties>(() => ({
  aspectRatio: `${previewAspectRatio.value}`,
}))

const previewGridStyles = computed<CSSProperties>(() => ({
  gridTemplateColumns: `repeat(${activeDifficulty.value.gridSize}, minmax(0, 1fr))`,
}))

const DraggableClass = "piece-draggable"
const snapDurationMs = 240
const snappingPieceIds = shallowRef<ReadonlySet<string>>(new Set())
const snapTimers = new Map<string, ReturnType<typeof setTimeout>>()

const { result, reset: resetSwap } = useSwap(puzzleRef, puzzlePieces, {
  animation: 150,
  draggable: `.${DraggableClass}`,
  onUpdate: (e) => {
    const { oldIndex, newIndex } = e

    checkPiece(oldIndex!, { animate: true })
    checkPiece(newIndex!, { animate: true })
  },
})

function checkPiece(index: number, options: { animate?: boolean } = {}) {
  const piece = result.value[index]
  if (!piece) return

  const renderRow = Math.floor(index / puzzle.value.columns)
  const renderCol = index % puzzle.value.columns
  const wasRestored = piece.restored

  piece.restored = piece.id === `${renderRow}-${renderCol}`

  if (options.animate && piece.restored && !wasRestored) {
    triggerPieceSnap(piece.id)
  }
}

watch(result, () => {
  result.value.forEach((_, index) => checkPiece(index))
})

const isPuzzleRestored = computed(() =>
  result.value.every((piece) => piece.restored),
)

function isPieceSnapActive(piece: PuzzlePiece) {
  return snappingPieceIds.value.has(piece.id)
}

function triggerPieceSnap(pieceId: PuzzlePiece["id"]) {
  clearTimeout(snapTimers.get(pieceId))

  snappingPieceIds.value = new Set(snappingPieceIds.value).add(pieceId)

  const timer = setTimeout(() => {
    snapTimers.delete(pieceId)
    const next = new Set(snappingPieceIds.value)
    next.delete(pieceId)
    snappingPieceIds.value = next
  }, snapDurationMs)

  snapTimers.set(pieceId, timer)
}

function clearPieceMotion() {
  for (const timer of snapTimers.values()) {
    clearTimeout(timer)
  }
  snapTimers.clear()
  snappingPieceIds.value = new Set()
}

function getPieceStyles(piece: PuzzlePiece): CSSProperties {
  return {
    backgroundImage: "var(--puzzle-source)",
    backgroundPosition: getPieceBackgroundPosition(piece),
    backgroundSize: "var(--puzzle-bg-size)",
  }
}

function getPieceBackgroundPosition(piece: PuzzlePiece) {
  const x =
    puzzle.value.columns <= 1
      ? 0
      : (piece.column / (puzzle.value.columns - 1)) * 100
  const y =
    puzzle.value.rows <= 1 ? 0 : (piece.row / (puzzle.value.rows - 1)) * 100

  return `${x}% ${y}%`
}

function toCssUrl(url: string) {
  return `url("${url.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`
}

watch(
  selectedImage,
  async (image, _, onCleanup) => {
    imageInfo.value = null
    imageError.value = ""

    if (!image) return

    let cancelled = false
    let cancelImageLoad = () => {}
    onCleanup(() => {
      cancelled = true
      cancelImageLoad()
    })

    try {
      const info = await readImageInfo(image.url, (cleanup) => {
        cancelImageLoad = cleanup
      })
      if (!cancelled) imageInfo.value = info
    } catch {
      if (!cancelled) imageError.value = "图片解码失败,请换一张图片。"
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearPieceMotion()
  for (const [url, timer] of pendingObjectUrlRevokeTimers) {
    clearTimeout(timer)
    URL.revokeObjectURL(url)
  }
  pendingObjectUrlRevokeTimers.clear()
  revokeUploadedObjectUrl()
})

function selectSampleImage() {
  clearPieceMotion()
  const oldObjectUrl = uploadedObjectUrl.value
  uploadedObjectUrl.value = null
  const nextImage: PuzzleImage = {
    kind: "sample",
    name: "安全示例图",
    url: sampleImageUrl,
  }
  selectedImage.value = nextImage
  activeImage.value = nextImage
  fitMode.value = "contain"
  isPlaying.value = false
  scheduleObjectUrlRevoke(oldObjectUrl)
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) selectUploadedFile(file)
  input.value = ""
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) selectUploadedFile(file)
}

function selectUploadedFile(file: File) {
  clearPieceMotion()
  imageError.value = ""

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    imageError.value = "只支持 JPG、PNG 或 WebP 图片。"
    return
  }

  if (file.size > maxUploadBytes) {
    imageError.value = "图片过大,请使用 12MB 以内的图片。"
    return
  }

  const oldObjectUrl = uploadedObjectUrl.value
  const objectUrl = URL.createObjectURL(file)
  uploadedObjectUrl.value = objectUrl
  const nextImage: PuzzleImage = {
    kind: "upload",
    name: file.name,
    url: objectUrl,
  }
  selectedImage.value = nextImage
  activeImage.value = nextImage
  fitMode.value = "contain"
  isPlaying.value = false
  scheduleObjectUrlRevoke(oldObjectUrl)
}

function startPuzzle() {
  if (!selectedImage.value || imageError.value) return

  clearPieceMotion()
  activeImage.value = selectedImage.value
  isPlaying.value = true
}

function changeImage() {
  clearPieceMotion()
  isPlaying.value = false
}

function reset() {
  clearPieceMotion()
  resetSwap()
}

function refresh() {
  clearPieceMotion()
  shufflePuzzle()
}

function revokeUploadedObjectUrl() {
  if (uploadedObjectUrl.value) {
    URL.revokeObjectURL(uploadedObjectUrl.value)
    uploadedObjectUrl.value = null
  }
}

function scheduleObjectUrlRevoke(url: string | null) {
  if (!url || pendingObjectUrlRevokeTimers.has(url)) return

  const timer = setTimeout(() => {
    pendingObjectUrlRevokeTimers.delete(url)

    if (isObjectUrlInUse(url)) {
      scheduleObjectUrlRevoke(url)
      return
    }

    URL.revokeObjectURL(url)
  }, 5000)

  pendingObjectUrlRevokeTimers.set(url, timer)
}

function isObjectUrlInUse(url: string) {
  return (
    uploadedObjectUrl.value === url ||
    selectedImage.value?.url === url ||
    activeImage.value.url === url
  )
}

function readImageInfo(
  url: string,
  setCleanup?: (cleanup: () => void) => void,
): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false

    setCleanup?.(() => {
      if (settled) return
      image.onload = null
      image.onerror = null
      image.src = ""
    })

    image.onload = () => {
      settled = true
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      settled = true
      reject(new Error("Failed to load image."))
    }
    image.src = url
  })
}
</script>

<template>
  <main
    class="puzzle-page mx-auto min-h-screen w-full max-w-5xl px-5 py-8 text-neutral-900"
    :class="{ 'puzzle-page--playing': isPlaying }"
  >
    <header class="puzzle-page__header mb-7 max-w-2xl">
      <p
        class="puzzle-page__kicker mb-2 font-mono text-xs tracking-wide text-neutral-500 uppercase"
      >
        Local image puzzle
      </p>
      <h1 class="puzzle-page__title font-700 tracking-none m-0 text-4xl">
        Puzzle
      </h1>
      <p v-if="!isPlaying" class="mt-3 text-base leading-7 text-neutral-600">
        上传一张图片,在本机切成拼图。图片不会上传,也不会离开你的浏览器。
      </p>
    </header>

    <section
      v-if="!isPlaying"
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]"
    >
      <div class="space-y-5">
        <input
          ref="fileInputRef"
          class="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择本地图片文件"
          @change="handleFileChange"
        />

        <button
          type="button"
          class="w-full rounded-sm border-2 border-neutral-900 bg-white px-6 py-8 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-neutral-900/30"
          :class="isDragging ? 'bg-sky-50' : 'hover:bg-neutral-50'"
          @click="openFilePicker"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <span class="font-700 block text-xl">上传图片</span>
          <span class="mt-2 block text-sm leading-6 text-neutral-600">
            拖拽图片到这里,或点击选择 JPG / PNG / WebP。图片只在你本机处理。
          </span>
        </button>

        <p
          v-if="imageError"
          class="rounded-sm bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {{ imageError }}
        </p>

        <div
          v-if="selectedImage"
          class="rounded-sm border border-neutral-200 bg-white p-4"
          aria-label="图片预览"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="m-0 text-sm text-neutral-500">当前图片</p>
              <p class="font-700 m-0 break-all">
                {{ selectedImage.name }}
              </p>
            </div>
            <button
              type="button"
              class="min-h-11 rounded-sm border border-neutral-300 px-3 text-sm hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-neutral-900/30 focus-visible:outline-none"
              @click="openFilePicker"
            >
              换图
            </button>
          </div>

          <div
            class="relative overflow-hidden rounded-sm bg-neutral-100"
            :style="previewStyles"
          >
            <img
              :src="selectedImage.url"
              alt="将被切成拼图的完整图片预览"
              class="h-full w-full"
              :class="previewImageClass"
            />
            <div
              class="pointer-events-none absolute inset-0 grid border border-white/70"
              :style="previewGridStyles"
              aria-hidden="true"
            >
              <template
                v-for="index in activeDifficulty.gridSize *
                activeDifficulty.gridSize"
                :key="index"
              >
                <span
                  class="border border-white/65 shadow-[0_0_0_1px_rgba(0,0,0,0.14)]"
                />
              </template>
            </div>
          </div>

          <p class="mt-3 text-sm leading-6 text-neutral-600">
            {{
              fitMode === "crop"
                ? "当前预览会裁成适合拼图的矩形。"
                : "默认保留全图,棋盘比例跟随图片,拼块可以是矩形。"
            }}
          </p>

          <fieldset
            v-if="shouldOfferCrop"
            class="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-3"
          >
            <legend class="font-700 px-1 text-sm text-amber-900">
              这张图比例比较极端
            </legend>
            <p class="m-0 mb-3 text-sm leading-6 text-amber-900">
              默认仍保全图。如果你想要更适合拼图的画面,可以裁成合理矩形。
            </p>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="option in [
                  { value: 'contain', label: '保全图' },
                  { value: 'crop', label: '裁成合理矩形' },
                ]"
                :key="option.value"
                class="min-h-11 cursor-pointer rounded-sm border border-amber-300 bg-white px-3 py-2 text-sm has-checked:border-amber-900 has-checked:bg-amber-100"
              >
                <input
                  v-model="fitMode"
                  type="radio"
                  class="mr-2"
                  name="fit-mode"
                  :value="option.value"
                />
                {{ option.label }}
              </label>
            </div>
          </fieldset>
        </div>
      </div>

      <aside class="space-y-5">
        <div class="rounded-sm border border-neutral-200 bg-white p-4">
          <h2 class="font-700 m-0 text-base">难度</h2>
          <div class="mt-3 grid gap-2">
            <button
              v-for="item in difficulties"
              :key="item.key"
              type="button"
              class="min-h-12 rounded-sm border px-3 text-left focus-visible:ring-3 focus-visible:ring-neutral-900/30 focus-visible:outline-none"
              :class="
                difficulty === item.key
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 bg-white hover:bg-neutral-50'
              "
              :aria-pressed="difficulty === item.key"
              @click="difficulty = item.key"
            >
              <span class="font-700">{{ item.label }}</span>
              <span class="ml-2 text-sm opacity-75">{{ item.helper }}</span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <BitButton
            :disabled="!selectedImage || !!imageError"
            @click="startPuzzle"
          >
            <span class="min-w-24">开始</span>
          </BitButton>
          <button
            type="button"
            class="min-h-11 rounded-sm border border-neutral-300 px-4 text-sm hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-neutral-900/30 focus-visible:outline-none"
            @click="selectSampleImage"
          >
            用示例图
          </button>
        </div>

        <p class="text-sm leading-6 text-neutral-500">
          示例图为自有安全占位图,不包含第三方游戏美术。内置图集后续再考虑。
        </p>
      </aside>
    </section>

    <section v-else class="puzzle-play">
      <div
        class="puzzle-play__toolbar mb-5 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <p class="m-0 text-sm text-neutral-500">
            {{ activeImage.name }} · {{ activeDifficulty.label }}
            {{ activeDifficulty.helper }}
          </p>
          <p class="m-0 text-sm text-neutral-500">
            全图优先 · {{ puzzle.columns }}×{{ puzzle.rows }} 矩形拼面
          </p>
        </div>
        <button
          type="button"
          class="min-h-11 rounded-sm border border-neutral-300 px-4 text-sm hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-neutral-900/30 focus-visible:outline-none"
          @click="changeImage"
        >
          换图
        </button>
      </div>

      <div ref="boardSlotRef" class="puzzle-play__board-slot">
        <template v-if="loading">
          <div
            class="rounded-sm bg-neutral-100 px-4 py-12 text-center text-neutral-500"
          >
            正在切图…
          </div>
        </template>
        <template v-else-if="error">
          <p
            class="rounded-sm bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            图片生成失败,请换一张图片。
          </p>
        </template>
        <template v-else>
          <div
            ref="puzzleRef"
            class="puzzle grid overflow-hidden rounded-sm transition-all duration-1200"
            :class="[isPuzzleRestored ? 'puzzle--complete gap-0' : 'gap-1']"
            :style="puzzleStyles"
            aria-label="拼图棋盘"
          >
            <div
              v-for="piece in result"
              :key="piece.id"
              class="puzzle-piece overflow-hidden bg-neutral-100 bg-no-repeat transition-all duration-1200"
              :class="[
                piece.restored && 'brightness-30',
                !isPuzzleRestored && 'b-1 b-gray-300',
                !(piece.restored || isPuzzleRestored) && DraggableClass,
                piece.restored && !isPuzzleRestored && 'puzzle-piece--locked',
                isPieceSnapActive(piece) && 'puzzle-piece--snap',
                isPuzzleRestored && 'brightness-100!',
              ]"
              :style="getPieceStyles(piece)"
              aria-hidden="true"
            />
          </div>
        </template>
      </div>

      <p
        v-if="showSmallPieceWarning"
        class="puzzle-play__hint rounded-sm bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="status"
      >
        当前屏幕上拼块较小,如果不好拖,建议换图后切到中等或简单。
      </p>

      <p
        v-if="isPuzzleRestored"
        class="puzzle-play__status rounded-sm bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        role="status"
      >
        已完成。
      </p>

      <div
        v-if="!loading"
        class="puzzle-play__controls mt-6 flex flex-wrap items-center gap-2"
      >
        <BitButton @click="reset">
          <span class="min-w-16">Reset</span>
        </BitButton>
        <BitButton @click="refresh">
          <span class="min-w-16">Refresh</span>
        </BitButton>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.puzzle-page--playing {
  max-block-size: 100svh;
  min-block-size: 100svh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-block: clamp(0.75rem, 2svh, 1.25rem);
}

.puzzle-page--playing .puzzle-page__header {
  flex: 0 0 auto;
  margin-block-end: clamp(0.5rem, 1.5svh, 1rem);
}

.puzzle-page--playing .puzzle-page__kicker {
  margin-block-end: 0.25rem;
}

.puzzle-page--playing .puzzle-page__title {
  font-size: clamp(1.5rem, 4svh, 2.25rem);
}

.puzzle-play {
  flex: 1 1 auto;
  min-block-size: 0;
  display: flex;
  flex-direction: column;
}

.puzzle-play__toolbar {
  flex: 0 0 auto;
  margin-block-end: clamp(0.5rem, 1.5svh, 1rem);
}

.puzzle-play__board-slot {
  flex: 1 1 auto;
  min-block-size: 0;
  display: grid;
  place-items: center;
}

.puzzle-play__hint,
.puzzle-play__status {
  flex: 0 0 auto;
  margin-block: 0.5rem 0;
}

.puzzle-play__controls {
  flex: 0 0 auto;
  margin-block-start: clamp(0.5rem, 1.5svh, 1rem);
}

.puzzle {
  max-inline-size: 100%;
  max-block-size: 100%;
  transform-origin: center;
}

.puzzle--complete {
  animation: puzzle-complete-breathe 920ms ease-in-out 3;
  will-change: transform, opacity;
}

.puzzle-piece {
  position: relative;
  transform: translateZ(0);
  will-change: transform, opacity;
}

.puzzle-piece::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
  background: rgba(251, 191, 36, 0.22);
  opacity: 0;
  transition: opacity 180ms ease-out;
}

.puzzle-piece--locked::after {
  opacity: 0.1;
}

.puzzle-piece--snap {
  animation: puzzle-piece-snap-lock 240ms ease-out;
}

.puzzle-piece--snap::after {
  animation: puzzle-piece-confirm 240ms ease-out;
}

@keyframes puzzle-piece-snap-lock {
  0% {
    transform: translateZ(0) scale(1);
  }

  52% {
    transform: translateZ(0) scale(1.04);
  }

  82% {
    transform: translate3d(0, 1px, 0) scale(1);
  }

  100% {
    transform: translateZ(0) scale(1);
  }
}

@keyframes puzzle-piece-confirm {
  0% {
    opacity: 0;
  }

  30% {
    opacity: 0.3;
  }

  100% {
    opacity: 0.1;
  }
}

@keyframes puzzle-complete-breathe {
  0%,
  100% {
    transform: translateZ(0) scale(1);
  }

  50% {
    transform: translateZ(0) scale(1.012);
  }
}

@media (prefers-reduced-motion: reduce) {
  .puzzle--complete,
  .puzzle-piece--snap {
    animation: none;
  }

  .puzzle-piece,
  .puzzle-piece::after {
    transition-duration: 1ms;
  }

  .puzzle-piece--snap::after {
    animation: none;
    opacity: 0.18;
  }
}
</style>
