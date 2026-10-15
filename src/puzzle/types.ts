import type { GRID_SIZES, START_MODES } from './constants'

export type GridSize = (typeof GRID_SIZES)[number]
export type StartMode = (typeof START_MODES)[number]
export type SlotIndex = number
export type TileId = number
export type RandomSource = () => number

export interface PuzzleConfig {
  readonly gridSize: GridSize
  readonly startMode: StartMode
}

export interface PuzzleState extends PuzzleConfig {
  readonly sessionId: string
  /** 按稳定格位顺序保存图块编号；编号也就是图块的目标格位。 */
  readonly tiles: readonly TileId[]
  readonly moves: number
}

export interface SwapRequest {
  readonly sessionId: string
  /** 同一局的提交版本，防止同一输入被重复提交。 */
  readonly expectedMoves: number
  readonly sourceSlot: SlotIndex
  readonly targetSlot: SlotIndex
}

export interface BuiltinImageMetadata {
  readonly id: string
  readonly displayName: string
  readonly assetVersion: number
  readonly path: string
  readonly width: number
  readonly height: number
}

interface NormalizedImage {
  readonly id: string
  readonly displayName: string
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

export type PuzzleImage = NormalizedImage &
  ({ readonly source: 'builtin'; readonly assetVersion: number } | { readonly source: 'upload' })

/** 对象 URL 只属于当前视图的资源，不是图片数据的一部分。 */
export interface PuzzleImageResource {
  readonly image: PuzzleImage
  readonly url: string
  release(): void
}
