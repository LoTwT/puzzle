import { fileURLToPath } from 'node:url'

import { expect, test } from './fixtures.ts'
import { fixturePath, fixtureState, readSnapshot, seedPuzzle, slots } from './helpers.ts'

const saveWarning = '本局暂时无法保存，刷新后可能丢失进度'

test('两次点选只交换一次，原图和取消设置不保存', async ({ page }) => {
  await seedPuzzle(page)
  await slots(page).nth(0).click()
  await expect(slots(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  await slots(page).nth(1).click()
  await expect(page.getByText('交换 8 次', { exact: true })).toBeVisible()
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
  const saved = await readSnapshot(page)
  expect(saved?.state.tiles).toEqual([2, 1, 0, 4, 5, 3, 7, 8, 6])
  await page.getByRole('button', { name: '查看原图' }).click()
  await expect(page.getByRole('img', { name: 'fixture.png，完整图片' })).toBeVisible()
  await page.getByRole('button', { name: '返回拼图' }).click()
  await page.getByRole('button', { name: '换张图片' }).click()
  const settings = page.getByRole('dialog', { name: '换张图片' })
  await settings.getByText('5 × 5', { exact: true }).click()
  await expect(settings.getByRole('radio', { name: '5 × 5' })).toBeChecked()
  await settings.getByText('辅助开局', { exact: true }).click()
  await expect(settings.getByRole('radio', { name: '辅助开局' })).toBeChecked()
  await settings.getByRole('button', { name: '取消' }).click()
  expect(await readSnapshot(page)).toEqual(saved)
  await expect(page.locator('header')).toContainText('3 × 3 · 随机开局')
  await expect(page.getByText('交换 8 次', { exact: true })).toBeVisible()
})

test('上传后刷新完整恢复图片、配置、排列与步数，重开沿用模式', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始拼图', exact: true })).toBeEnabled()
  expect(await readSnapshot(page)).toBeUndefined()
  await page.getByLabel('从设备选图').setInputFiles(fileURLToPath(fixturePath))
  await expect(page.getByRole('img', { name: 'puzzle.png，整图预览' })).toBeVisible()
  await page.getByText('5 × 5', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '5 × 5' })).toBeChecked()
  await page.getByText('随机开局', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '随机开局' })).toBeChecked()
  await page.getByRole('button', { name: '开始拼图', exact: true }).click()
  await expect.poll(async () => (await readSnapshot(page))?.state.gridSize).toBe(5)
  const unlocked = page.locator('.puzzle-slot[aria-disabled="false"]')
  await unlocked.nth(0).click()
  await unlocked.nth(1).click()
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(1)
  const saved = await readSnapshot(page)
  const labels = await slots(page).evaluateAll((elements) =>
    elements.map((el) => el.getAttribute('aria-label')),
  )
  await page.reload()
  await expect(page.locator('header')).toContainText('5 × 5 · 随机开局')
  await expect(page.getByText('交换 1 次', { exact: true })).toBeVisible()
  expect(
    await slots(page).evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('aria-label')),
    ),
  ).toEqual(labels)
  expect(await readSnapshot(page)).toEqual(saved)
  // 恢复后的图片还要支持继续保存；只读取刚恢复的 Blob 无法发现文件引用失效。
  await unlocked.nth(0).click()
  await unlocked.nth(1).click()
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(2)
  const continued = await readSnapshot(page)
  expect(continued?.image).toEqual(saved?.image)
  await page.reload()
  await expect(page.getByText('交换 2 次', { exact: true })).toBeVisible()
  expect(await readSnapshot(page)).toEqual(continued)
  await page.getByRole('button', { name: '查看原图' }).click()
  const original = page.getByRole('img', { name: 'puzzle.png，完整图片' })
  await expect(original).toBeVisible()
  expect(
    await original.evaluate(async (el) => {
      const image = el as HTMLImageElement
      await image.decode()
      const blob = await (await fetch(image.src)).blob()
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
      }
    }),
  ).toEqual({ width: 96, height: 64, bytes: saved?.image.bytes })
  await page.getByRole('button', { name: '返回拼图' }).click()
  await page.getByRole('button', { name: '重新打乱', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '重新打乱？' })
  await confirmation.getByRole('button', { name: '重新打乱', exact: true }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.state.sessionId)
    .not.toBe(saved?.state.sessionId)
  expect((await readSnapshot(page))?.state).toMatchObject({
    gridSize: 5,
    startMode: 'random',
    moves: 0,
  })
})

test('完成存档直接恢复稳定完成画面，能够再来一局', async ({ page }) => {
  await seedPuzzle(page, { ...fixtureState, tiles: [0, 1, 2, 3, 4, 5, 6, 7, 8], moves: 12 })
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  const image = page.getByRole('img', { name: 'fixture.png，拼图完成' })
  await expect(image).toBeVisible()
  await image.evaluate((el) => (el as HTMLImageElement).decode())
  expect((await readSnapshot(page))?.state.moves).toBe(12)
  await page.getByRole('button', { name: '再来一局' }).click()
  await expect(page.getByText('交换 0 次', { exact: true })).toBeVisible()
  await expect
    .poll(async () => (await readSnapshot(page))?.state.sessionId)
    .not.toBe(fixtureState.sessionId)
})

test('put 成功但事务失败仍提示，继续游戏且下次提交成功清除提示', async ({ page }) => {
  await seedPuzzle(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort(), { once: true })
      IDBObjectStore.prototype.put = put
      return request
    }
  })
  await slots(page).nth(0).click()
  await slots(page).nth(1).click()
  await expect(page.getByText(saveWarning, { exact: true })).toBeVisible()
  await expect(page.getByText('交换 8 次', { exact: true })).toBeVisible()
  expect((await readSnapshot(page))?.state).toEqual(fixtureState)
  await slots(page).nth(0).click()
  await slots(page).nth(2).click()
  await expect(page.getByText('交换 9 次', { exact: true })).toBeVisible()
  await expect(page.getByText(saveWarning, { exact: true })).toHaveCount(0)
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(9)
})

test('损坏图片和尺寸不符的记录保留，只有新局成功保存才能替换', async ({ page }) => {
  await seedPuzzle(page)
  for (const damage of ['size', 'blob'] as const) {
    await page.evaluate(async (damage) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('puzzle', 1)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const transaction = db.transaction('sessions', 'readwrite')
          const store = transaction.objectStore('sessions')
          const request = store.get('current')
          request.onsuccess = () => {
            const saved = request.result
            if (damage === 'size') saved.image.width = 95
            else saved.image.blob = new Blob(['broken PNG'], { type: 'image/png' })
            store.put(saved, 'current')
          }
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
    }, damage)
    const broken = await readSnapshot(page)
    await page.reload()
    await expect(page.getByText('上次进度无法恢复，请开始新局', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '开始拼图', exact: true })).toBeEnabled()
    expect(await readSnapshot(page)).toEqual(broken)
  }
  await page.getByRole('button', { name: '开始拼图', exact: true }).click()
  await expect(page.getByText('上次进度无法恢复，请开始新局', { exact: true })).toHaveCount(0)
  expect((await readSnapshot(page))?.state.sessionId).not.toBe(fixtureState.sessionId)
})
