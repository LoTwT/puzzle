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
    sourceBase64: "",
  })

  const puzzlePieces = ref<PuzzlePiece[]>([])
  const loading = ref(true)
  const error = ref<Error | null>(null)

  watchEffect(async () => {
    if (import.meta.server) return

    try {
      loading.value = true

      const actualUrl = toValue(url)
      const actualGridSize = toValue(gridSize)
      const actualFitMode = toValue(fitMode) ?? "contain"

      const image = await loadImage(actualUrl)
      const imageWidth = image.naturalWidth
      const imageHeight = image.naturalHeight
      const sourceRect = getSourceRect(imageWidth, imageHeight, actualFitMode)

      const sourceBase64 = renderImagePieceToJpeg(
        image,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
      )

      const internalPieces: PuzzlePiece[] = []
      const tasks: (() => Promise<void>)[] = []
      const pieceSourceWidth = sourceRect.width / actualGridSize
      const pieceSourceHeight = sourceRect.height / actualGridSize

      for (let row = 0; row < actualGridSize; row += 1) {
        for (let col = 0; col < actualGridSize; col += 1) {
          const id = `${row}-${col}` satisfies PuzzlePiece["id"]
          const x = sourceRect.x + col * pieceSourceWidth
          const y = sourceRect.y + row * pieceSourceHeight

          tasks.push(async () => {
            const pieceBase64 = renderImagePieceToJpeg(
              image,
              x,
              y,
              pieceSourceWidth,
              pieceSourceHeight,
            )
            internalPieces.push({
              id,
              base64: pieceBase64,
              restored: false,
            })
          })
        }
      }

      await Promise.all(tasks.map((task) => task()))

      puzzle.value = {
        id: actualUrl,
        rows: actualGridSize,
        columns: actualGridSize,
        pieceWidth: Math.max(1, Math.round(pieceSourceWidth)),
        pieceHeight: Math.max(1, Math.round(pieceSourceHeight)),
        aspectRatio: sourceRect.width / sourceRect.height,
        sourceBase64,
      }
      puzzlePieces.value = shuffleArray(internalPieces)
      error.value = null
    } catch (e) {
      puzzlePieces.value = []
      error.value = e as Error
    } finally {
      loading.value = false
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to load puzzle image."))
    image.src = url
  })
}

function renderImagePieceToJpeg(
  image: HTMLImageElement,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
): string {
  const canvas = document.createElement("canvas")
  const outputWidth = Math.max(1, Math.round(width))
  const outputHeight = Math.max(1, Math.round(height))
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas rendering is not available.")
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    width,
    height,
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
