const MIN_PIECE_SIZE = 50

export function usePuzzle(
  url: MaybeRefOrGetter<string>,
  pieceSize?: MaybeRefOrGetter<number | undefined>,
) {
  const puzzle = ref<Puzzle>({
    id: "",
    rows: 0,
    columns: 0,
    pieceSize: 0,
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
      const actualPieceSize = toValue(pieceSize)

      const image = await loadImage(actualUrl)
      const imageWidth = image.naturalWidth
      const imageHeight = image.naturalHeight

      const sourceBase64 = renderImageToJpeg(image)

      const internalPieceSize =
        actualPieceSize ||
        Math.max(gcd(imageWidth, imageHeight), MIN_PIECE_SIZE)

      const internalPieces: PuzzlePiece[] = []

      const tasks: (() => Promise<void>)[] = []

      for (let y = 0; y < imageHeight; y += internalPieceSize) {
        for (let x = 0; x < imageWidth; x += internalPieceSize) {
          // TODO - handle the case when the image is not a multiple of the piece size
          // calc the actual size of the piece
          const w = Math.min(internalPieceSize, imageWidth - x)
          const h = Math.min(internalPieceSize, imageHeight - y)

          const id =
            `${Math.floor(y / internalPieceSize)}-${Math.floor(x / internalPieceSize)}` satisfies PuzzlePiece["id"]

          tasks.push(async () => {
            const pieceBase64 = renderImagePieceToJpeg(image, x, y, w, h)
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
        rows: Math.ceil(imageHeight / internalPieceSize),
        columns: Math.ceil(imageWidth / internalPieceSize),
        pieceSize: internalPieceSize,
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to load puzzle image."))
    image.src = url
  })
}

function renderImageToJpeg(image: HTMLImageElement): string {
  return renderImagePieceToJpeg(
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
  )
}

function renderImagePieceToJpeg(
  image: HTMLImageElement,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
): string {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas rendering is not available.")
  }

  context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg")
}
