export function usePuzzle(
  url: MaybeRefOrGetter<string>,
  gridSize: MaybeRefOrGetter<number>,
  fitMode?: MaybeRefOrGetter<PuzzleFitMode | undefined>,
) {
  const puzzle = ref<Puzzle>({
    id: "",
    rows: 0,
    columns: 0,
    pieceWidth: 0,
    pieceHeight: 0,
    aspectRatio: 1,
    sourceUrl: "",
  })

  const puzzlePieces = ref<PuzzlePiece[]>([])
  const loading = ref(true)
  const error = ref<Error | null>(null)

  watchEffect(async (onCleanup) => {
    if (import.meta.server) return

    let cancelled = false
    let cancelImageLoad = () => {}
    onCleanup(() => {
      cancelled = true
      cancelImageLoad()
    })

    try {
      loading.value = true

      const actualUrl = toValue(url)
      const actualGridSize = toValue(gridSize)
      const actualFitMode = toValue(fitMode) ?? "contain"

      const image = await loadImage(actualUrl, (cleanup) => {
        cancelImageLoad = cleanup
      })
      if (cancelled) return

      const imageWidth = image.naturalWidth
      const imageHeight = image.naturalHeight
      const sourceRect = getSourceRect(imageWidth, imageHeight, actualFitMode)
      const sourceUrl =
        actualFitMode === "crop"
          ? renderImageToJpeg(image, sourceRect)
          : actualUrl

      const internalPieces: PuzzlePiece[] = []
      const pieceSourceWidth = sourceRect.width / actualGridSize
      const pieceSourceHeight = sourceRect.height / actualGridSize

      for (let row = 0; row < actualGridSize; row += 1) {
        for (let col = 0; col < actualGridSize; col += 1) {
          const id = `${row}-${col}` satisfies PuzzlePiece["id"]

          internalPieces.push({
            id,
            row,
            column: col,
            restored: false,
          })
        }
      }

      if (cancelled) return

      puzzle.value = {
        id: actualUrl,
        rows: actualGridSize,
        columns: actualGridSize,
        pieceWidth: Math.max(1, Math.round(pieceSourceWidth)),
        pieceHeight: Math.max(1, Math.round(pieceSourceHeight)),
        aspectRatio: sourceRect.width / sourceRect.height,
        sourceUrl,
      }
      puzzlePieces.value = shuffleArray(internalPieces)
      error.value = null
    } catch (e) {
      if (cancelled) return

      puzzlePieces.value = []
      error.value = e as Error
    } finally {
      if (!cancelled) loading.value = false
    }
  })

  const refresh = () => {
    const pieces = puzzlePieces.value.slice()
    puzzlePieces.value = shuffleArray(pieces)
  }

  return {
    puzzle,
    puzzlePieces,
    loading,
    error,
    refresh,
  }
}

interface SourceRect {
  x: number
  y: number
  width: number
  height: number
}

function loadImage(
  url: string,
  setCleanup?: (cleanup: () => void) => void,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false

    setCleanup?.(() => {
      if (settled) return
      image.onload = null
      image.onerror = null
      image.src = ""
    })

    image.decoding = "async"
    image.onload = () => {
      settled = true
      resolve(image)
    }
    image.onerror = () => {
      settled = true
      reject(new Error("Failed to load puzzle image."))
    }
    image.src = url
  })
}

function renderImageToJpeg(
  image: HTMLImageElement,
  sourceRect: SourceRect,
): string {
  const canvas = document.createElement("canvas")
  const outputWidth = Math.max(1, Math.round(sourceRect.width))
  const outputHeight = Math.max(1, Math.round(sourceRect.height))
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas rendering is not available.")
  }

  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )
  return canvas.toDataURL("image/jpeg")
}

function getSourceRect(
  imageWidth: number,
  imageHeight: number,
  fitMode: PuzzleFitMode,
): SourceRect {
  if (fitMode === "contain") {
    return {
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
    }
  }

  const sourceAspect = imageWidth / imageHeight
  const targetAspect = sourceAspect >= 1 ? 16 / 9 : 4 / 5

  if (sourceAspect > targetAspect) {
    const width = imageHeight * targetAspect
    return {
      x: (imageWidth - width) / 2,
      y: 0,
      width,
      height: imageHeight,
    }
  }

  const height = imageWidth / targetAspect
  return {
    x: 0,
    y: (imageHeight - height) / 2,
    width: imageWidth,
    height,
  }
}
