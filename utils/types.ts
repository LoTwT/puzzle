export interface PuzzlePiece {
  id: `${number}-${number}`
  base64: string
  restored: boolean
}

export interface Puzzle {
  id: string
  rows: number
  columns: number
  pieceWidth: number
  pieceHeight: number
  aspectRatio: number
  sourceBase64: string
}

export type PuzzleFitMode = "contain" | "crop"
