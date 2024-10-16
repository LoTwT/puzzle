import { Jimp, JimpMime } from "jimp"

export function usePuzzle(
  url: MaybeRefOrGetter<string>,
  pieceSize?: MaybeRefOrGetter<number>,
) {
  const puzzle = ref<Puzzle>({
    id: "",
    rows: 0,
    columns: 0,
    pieceSize: 0,
    sourceBase64: "",
  })

  const puzzlePieces = ref<PuzzlePiece[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  watchEffect(async () => {
    try {
      loading.value = true

      const actualUrl = toValue(url)
      const actualPieceSize = toValue(pieceSize)

      const image = await Jimp.read(actualUrl)
      const imageWidth = image.bitmap.width
      const imageHeight = image.bitmap.height

      const sourceBase64 = await image.getBase64(JimpMime.jpeg)

      const internalPieceSize = actualPieceSize || gcd(imageWidth, imageHeight)
      const internalPieces: PuzzlePiece[] = []

      const tasks: (() => Promise<void>)[] = []

      for (let y = 0; y < imageHeight; y += internalPieceSize) {
        for (let x = 0; x < imageWidth; x += internalPieceSize) {
          // TODO - handle the case when the image is not a multiple of the piece size
          // calc the actual size of the piece
          const w = Math.min(internalPieceSize, imageWidth - x)
          const h = Math.min(internalPieceSize, imageHeight - y)

          const piece = image.clone().crop({ x, y, w, h })
          const id =
            `${Math.floor(x / internalPieceSize)}-${Math.floor(y / internalPieceSize)}` satisfies PuzzlePiece["id"]

          tasks.push(async () => {
            const pieceBase64 = await piece.getBase64(JimpMime.jpeg)
            internalPieces.push({
              id,
              base64: pieceBase64,
              restored: true,
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

  return {
    puzzle,
    puzzlePieces,
    loading,
    error,
  }
}
