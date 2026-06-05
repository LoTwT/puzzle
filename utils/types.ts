export interface PuzzlePiece {
  id: `${number}-${number}`
  row: number
  column: number
  restored: boolean
}

export interface Puzzle {
  id: string
  rows: number
  columns: number
  pieceWidth: number
  pieceHeight: number
  aspectRatio: number
  sourceUrl: string
}

export type PuzzleFitMode = "contain" | "crop"
