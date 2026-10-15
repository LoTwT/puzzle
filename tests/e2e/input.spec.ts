import { expect, test, type Page } from '@playwright/test'

import { fixtureState, readSnapshot, seedPuzzle, slots } from './helpers.ts'

async function point(page: Page, slot: number, xFraction = 0.5, yFraction = 0.5) {
  const box = await slots(page).nth(slot).boundingBox()
  if (!box) throw new Error('Missing slot bounds.')
  return { x: box.x + box.width * xFraction, y: box.y + box.height * yFraction }
}

async function startDrag(page: Page, source = 0, target = 1) {
  const from = await point(page, source, 0.2, 0.3)
  const to = await point(page, target)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y)
  await expect(page.locator('.puzzle-floating-tile')).toBeVisible()
  return { from, to }
}

async function trackWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    Object.assign(window, { puzzleWrites: 0 })
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions') {
        const tracked = window as unknown as { puzzleWrites: number }
        tracked.puzzleWrites++
      }
      return put.apply(this, args)
    }
  })
}

const writeCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { puzzleWrites: number }).puzzleWrites)

test('触控外侧滑动产生原生取消，长图选择仍可完成一次交换（Chromium 模拟）', async ({
  browser,
  browserName,
  baseURL,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP 触控手势仅供 Chromium 模拟；桌面长图流程在三个引擎共用。',
  )
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await seedPuzzle(page, fixtureState, { width: 96, height: 480 })
    await trackWrites(page)
    const source = await point(page, 0)
    await page.touchscreen.tap(source.x, source.y)
    await expect(slots(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 8,
      y: 700,
      yDistance: -1000,
      gestureSourceType: 'touch',
      speed: 1800,
      preventFling: true,
    })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900)
    const sourceBox = (await slots(page).nth(0).boundingBox())!
    expect(sourceBox.y + sourceBox.height).toBeLessThan(0)
    await expect(slots(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
    expect(await writeCount(page)).toBe(0)
    const scrollY = await page.evaluate(() => window.scrollY)
    const target = await point(page, 6)
    await page.touchscreen.tap(target.x, target.y)
    await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
    expect((await readSnapshot(page))?.state.tiles).toEqual([7, 2, 0, 4, 5, 3, 1, 8, 6])
    expect(await writeCount(page)).toBe(1)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  } finally {
    await context.close()
  }
})

test('实际拿起的图块保留偏移，合法拖动与合成 click 只交换并保存一次', async ({ page }) => {
  await seedPuzzle(page)
  await trackWrites(page)
  await slots(page).nth(2).click()
  const { from, to } = await startDrag(page)
  const source = await slots(page).nth(0).boundingBox()
  const floating = await page.locator('.puzzle-floating-tile').boundingBox()
  expect(floating!.x).toBeCloseTo(to.x - (from.x - source!.x), 1)
  expect(floating!.y).toBeCloseTo(to.y - (from.y - source!.y), 1)
  await expect(slots(page).nth(1)).toHaveClass(/is-drop-target/)
  await expect(page.locator('.puzzle-slot[aria-pressed="true"]')).toHaveCount(0)
  expect(await writeCount(page)).toBe(0)
  await page.mouse.up()
  await expect(page.getByText('交换 8 次', { exact: true })).toBeVisible()
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
  expect((await readSnapshot(page))?.state.tiles).toEqual([2, 1, 0, 4, 5, 3, 7, 8, 6])
  expect(await writeCount(page)).toBe(1)
  await expect(page.locator('.puzzle-floating-tile, .is-drop-target')).toHaveCount(0)
  await expect(page.locator('.puzzle-slot[aria-pressed="true"]')).toHaveCount(0)
  await expect(slots(page).nth(1)).toBeFocused()
  await expect(slots(page).nth(1)).toHaveAttribute('aria-disabled', 'true')
})

test('同格、锁定格、外框与越界释放及指针取消不修改局面，随后可继续拖动', async ({ page }) => {
  await seedPuzzle(page, { ...fixtureState, tiles: [1, 2, 0, 4, 3, 5, 7, 6, 8] })
  await trackWrites(page)
  const before = await readSnapshot(page)
  const board = page.locator('.puzzle-board')
  const rect = (await board.boundingBox())!
  const same = await point(page, 0)
  const locked = await point(page, 5)
  for (const target of [
    same,
    locked,
    { x: rect.x - 0.5, y: same.y },
    { x: rect.x + rect.width + 10, y: same.y },
  ]) {
    await startDrag(page)
    await page.mouse.move(target.x, target.y)
    await page.mouse.up()
    await expect(page.locator('.puzzle-floating-tile, .is-drop-target')).toHaveCount(0)
    expect(await readSnapshot(page)).toEqual(before)
  }
  for (const interruption of ['pointercancel', 'lostcapture', 'blur']) {
    await startDrag(page)
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else {
      await board.evaluate((element, interruption) => {
        // 鼠标主指针 ID 在浏览器事件中记录，不假设它始终等于 1。
        const id = Number(element.getAttribute('data-test-pointer'))
        if (interruption === 'pointercancel')
          element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id }))
        else element.releasePointerCapture(id)
      }, interruption)
      const to = await point(page, 1)
      await page.mouse.move(to.x + 1, to.y)
    }
    await expect(page.locator('.puzzle-floating-tile, .is-drop-target')).toHaveCount(0)
    await page.mouse.up()
    expect(await readSnapshot(page)).toEqual(before)
  }
  expect(await writeCount(page)).toBe(0)
  await startDrag(page)
  await page.mouse.up()
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
  expect(await writeCount(page)).toBe(1)
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('pointerdown', (event) => {
      const board = (event.target as Element).closest('.puzzle-board')
      if (board) board.setAttribute('data-test-pointer', String(event.pointerId))
    })
  })
})

test('键盘单停靠点，锁定格可聚焦，最后一步后焦点留在确认格并可重玩', async ({ page }) => {
  await seedPuzzle(page, { ...fixtureState, tiles: [0, 1, 2, 3, 4, 5, 6, 8, 7] })
  await expect(page.locator('.puzzle-slot[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(slots(page).nth(0)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(slots(page).nth(0)).toBeFocused()
  await expect(page.locator('.puzzle-slot[aria-pressed="true"]')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(slots(page).nth(2)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(slots(page).nth(8)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(slots(page).nth(8)).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(slots(page).nth(8)).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(slots(page).nth(8)).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  await expect(slots(page).nth(7)).toBeFocused()
  await expect(slots(page).nth(7)).toHaveAccessibleName(/第 3 行，第 2 列.*已归位/)
  await page.keyboard.press('Space')
  await expect(page.getByText('交换 8 次', { exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  const replay = page.getByRole('button', { name: '再来一局' })
  await expect(replay).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('交换 0 次', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新打乱', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '查看原图' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(slots(page).nth(0)).toBeFocused()
})

test('长图点选后从棋盘外滚动，来源离屏仍保留选择，目标只交换一次且不跳回', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await seedPuzzle(page, fixtureState, { width: 96, height: 480 })
  await trackWrites(page)
  await slots(page).nth(0).click()
  await expect(slots(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(8, 550)
  await page.mouse.wheel(0, 1200)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  await page
    .locator('main')
    .dispatchEvent('pointercancel', { pointerId: 77, isPrimary: true, pointerType: 'touch' })
  await expect(slots(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  const source = (await slots(page).nth(0).boundingBox())!
  expect(source.y + source.height).toBeLessThan(0)
  expect(await writeCount(page)).toBe(0)
  const scrollY = await page.evaluate(() => window.scrollY)
  const target = await point(page, 6)
  expect(target.y).toBeGreaterThan(0)
  expect(target.y).toBeLessThan(600)
  await page.mouse.click(target.x, target.y)
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
  expect((await readSnapshot(page))?.state.tiles).toEqual([7, 2, 0, 4, 5, 3, 1, 8, 6])
  expect(await writeCount(page)).toBe(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  await expect(slots(page).nth(6)).toBeFocused()
  await expect(page.locator('.puzzle-slot[aria-pressed="true"]')).toHaveCount(0)
})
