import { readFile } from 'node:fs/promises'

import { expect, type Page } from '@playwright/test'

import type { PuzzleSave, PuzzleState } from '../../src/puzzle/types.ts'

export const fixturePath = new URL('../fixtures/puzzle.png', import.meta.url)
export const fixtureState: PuzzleState = {
  sessionId: 'fixture-session',
  gridSize: 3,
  startMode: 'random',
  tiles: [1, 2, 0, 4, 5, 3, 7, 8, 6],
  moves: 7,
}

export async function seedPuzzle(
  page: Page,
  state = fixtureState,
  size = { width: 96, height: 64 },
) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始拼图', exact: true })).toBeEnabled()
  const bytes = [...(await readFile(fixturePath))]
  await page.evaluate(
    async ({ bytes, state, size }) => {
      let blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      if (size.width !== 96 || size.height !== 64) {
        const image = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        canvas.getContext('2d')!.drawImage(image, 0, 0, size.width, size.height)
        image.close()
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('Fixture encoding failed.'))),
            'image/png',
          ),
        )
      }
      const saved: PuzzleSave = {
        version: 1,
        image: {
          id: 'fixture-image',
          source: 'upload',
          displayName: 'fixture.png',
          blob,
          ...size,
        },
        state,
      }
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('puzzle', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('sessions')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const transaction = db.transaction('sessions', 'readwrite')
          transaction.objectStore('sessions').put(saved, 'current')
          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onabort = () => {
            db.close()
            reject(transaction.error)
          }
        }
      })
    },
    { bytes, state, size },
  )
  await page.reload()
  await expect(page.locator('header')).toContainText('fixture.png')
}

/** 只读取真实存档；返回 Blob 字节以核对刷新前后的同一份图片。 */
export async function readSnapshot(page: Page) {
  return page.evaluate(async () => {
    const saved = await new Promise<PuzzleSave | undefined>((resolve, reject) => {
      const open = indexedDB.open('puzzle', 1)
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('sessions', 'readonly')
        const request = transaction.objectStore('sessions').get('current')
        transaction.oncomplete = () => {
          db.close()
          resolve(request.result)
        }
        transaction.onabort = () => {
          db.close()
          reject(transaction.error)
        }
      }
    })
    if (!saved) return undefined
    const { blob, ...metadata } = saved.image
    return {
      ...saved,
      image: { ...metadata, bytes: [...new Uint8Array(await blob.arrayBuffer())] },
    }
  })
}

export function slots(page: Page) {
  return page.locator('.puzzle-slot')
}
