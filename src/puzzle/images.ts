import type { BuiltinImageMetadata, PuzzleImage, PuzzleImageResource } from './types'

export const GEOMETRY_IMAGE: BuiltinImageMetadata = {
  id: 'geometry',
  displayName: '彩色几何',
  assetVersion: 1,
  path: 'images/geometry.png',
  width: 1440,
  height: 1080,
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
      throw new Error('图片尺寸与资源信息不一致。')
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
  const response = await fetch(`${import.meta.env.BASE_URL}${metadata.path}`)
  if (!response.ok) throw new Error('无法加载内置图片。')
  const blob = await response.blob()
  return createImageResource({
    id: metadata.id,
    source: 'builtin',
    displayName: metadata.displayName,
    assetVersion: metadata.assetVersion,
    blob,
    width: metadata.width,
    height: metadata.height,
  })
}
