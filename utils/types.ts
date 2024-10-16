export interface PuzzlePiece {
  id: `${number}-${number}`
  base64: string
  restored: boolean
}

export interface Puzzle {
  id: string
  // pieces: PuzzlePiece[]
  rows: number
  columns: number
  pieceSize: number
  sourceBase64: string
}
