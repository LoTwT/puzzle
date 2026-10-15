import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_FILE_BYTES,
  MAX_IMAGE_PIXELS,
} from './constants'
import type { BuiltinImageMetadata, PuzzleImage, PuzzleImageResource } from './types'

export const GEOMETRY_IMAGE: BuiltinImageMetadata = {
  id: 'geometry',
  displayName: '彩色几何',
  assetVersion: 1,
  path: 'images/geometry.png',
  width: 1440,
  height: 1080,
}

export const BUILTIN_IMAGES: readonly BuiltinImageMetadata[] = [
  GEOMETRY_IMAGE,
  {
    id: 'city-windows',
    displayName: '城市窗格',
    assetVersion: 1,
    path: 'images/city-windows.png',
    width: 1440,
    height: 1080,
  },
  {
    id: 'plants',
    displayName: '植物静物',
    assetVersion: 1,
    path: 'images/plants.png',
    width: 1080,
    height: 1440,
  },
]

export class ImagePreparationError extends Error {}

export function imageErrorMessage(error: unknown): string {
  return error instanceof ImagePreparationError
    ? error.message
    : '图片处理失败，请重试或换一张图片。'
}

async function validateImageFile(blob: Blob) {
  if (blob.size > MAX_IMAGE_FILE_BYTES) {
    throw new ImagePreparationError('图片超过 10 MiB，请选择更小的文件。')
  }
  // File.type 可能为空，或由扩展名推成通用类型；实际格式以签名和解码为准。
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const startsWith = (bytes: number[], offset = 0) =>
    bytes.every((byte, i) => header[offset + i] === byte)
  const supported =
    startsWith([0xff, 0xd8, 0xff]) ||
    startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8))
  if (!supported) {
    if (blob.type && !IMAGE_MIME_TYPES.some((type) => type === blob.type))
      throw new ImagePreparationError('不支持此格式，请选择 JPEG、PNG 或 WebP 图片。')
    throw new ImagePreparationError('文件不是有效的 JPEG、PNG 或 WebP 图片，请重新选择。')
  }
}

/** 解码时应用方向且冻结动画帧；此后不再进行 EXIF 旋转。 */
export async function normalizeImage(
  blob: Blob,
): Promise<Pick<PuzzleImage, 'blob' | 'width' | 'height'>> {
  await validateImageFile(blob)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new ImagePreparationError('无法解码这张图片，文件可能已损坏。请换一张图片。')
  }
  const canvas = document.createElement('canvas')
  try {
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new ImagePreparationError('图片超过 2000 万像素，请降低分辨率后重试。')
    }
    if (!bitmap.width || !bitmap.height) {
      throw new ImagePreparationError('图片尺寸无效，请换一张图片。')
    }
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImagePreparationError('浏览器无法处理图片，请重试或更换浏览器。')
    context.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface')
      .trim()
    context.fillRect(0, 0, width, height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new ImagePreparationError('无法生成拼图图片，请重试或换一张图片。')),
        'image/png',
      )
    })
    return { blob: png, width, height }
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}

export async function createImageResource(image: PuzzleImage): Promise<PuzzleImageResource> {
  const url = URL.createObjectURL(image.blob)
  let released = false
  const release = () => {
    if (released) return
    URL.revokeObjectURL(url)
    released = true
  }
  try {
    const decoded = new Image()
    decoded.src = url
    await decoded.decode()
    if (decoded.naturalWidth !== image.width || decoded.naturalHeight !== image.height) {
      throw new ImagePreparationError('图片尺寸与资源信息不一致，请重新选择。')
    }
    return { image, url, release }
  } catch (error) {
    release()
    throw error
  }
}

export async function loadBuiltinImage(
  metadata: BuiltinImageMetadata,
): Promise<PuzzleImageResource> {
  let response: Response
  try {
    response = await fetch(`${import.meta.env.BASE_URL}${metadata.path}`)
  } catch {
    throw new ImagePreparationError('内置图片加载失败，请检查网络后重新选择。')
  }
  if (!response.ok) throw new ImagePreparationError('内置图片加载失败，请重试或选择其他图片。')
  const normalized = await normalizeImage(await response.blob())
  if (normalized.width !== metadata.width || normalized.height !== metadata.height) {
    throw new ImagePreparationError('内置图片资源不匹配，请刷新后重试。')
  }
  return createImageResource({
    id: metadata.id,
    source: 'builtin',
    displayName: metadata.displayName,
    assetVersion: metadata.assetVersion,
    ...normalized,
  })
}

export async function loadUploadedImage(file: File): Promise<PuzzleImageResource> {
  const normalized = await normalizeImage(file)
  return createImageResource({
    id: crypto.randomUUID(),
    source: 'upload',
    displayName: file.name,
    ...normalized,
  })
}
