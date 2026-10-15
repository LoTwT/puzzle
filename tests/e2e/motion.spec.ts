import { MOTION } from '../../src/puzzle/constants.ts'
import { expect, test, type Page } from './fixtures.ts'
import { fixtureState, readSnapshot, seedPuzzle, slots } from './helpers.ts'

// 在测试侧暂停真实 WAAPI 时间线，检查中间状态；产品没有测试开关。
async function controlAnimations(page: Page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      animation.pause()
      return animation
    }
  })
}

async function finishDuration(page: Page, duration: number) {
  await page.evaluate(async (duration) => {
    const animations = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().duration === duration)
    if (!animations.length) throw new Error(`Missing ${duration}ms animations`)
    const finished = animations.map((a) => a.finished)
    animations.forEach((a) => a.finish())
    await Promise.all(finished)
  }, duration)
}

async function clickPair(page: Page, source: number, target: number) {
  await slots(page).nth(source).click()
  await slots(page).nth(target).click()
}

test('落位阻止重入，180ms 后开放棋盘，连续局部归位可以重叠并稳定变暗', async ({ page }) => {
  await controlAnimations(page)
  await seedPuzzle(page)
  const board = page.locator('.puzzle-board')
  await clickPair(page, 0, 1)
  await expect(board).toHaveAttribute('data-phase', 'swapping')
  await expect(page.locator('.puzzle-moving-tile')).toHaveCount(2)
  await expect(page.locator('.is-moving')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '重新打乱', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '换张图片', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '查看原图', exact: true })).toBeDisabled()
  await slots(page).nth(3).dispatchEvent('click')
  await slots(page).nth(4).dispatchEvent('keydown', { key: 'Enter' })
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8)
  await expect(page.locator('.is-selected')).toHaveCount(0)
  await finishDuration(page, MOTION.swap)
  await expect(board).toHaveAttribute('data-phase', 'ready')
  await expect(slots(page).nth(1)).toHaveAttribute('data-correct-effect', 'true')
  await clickPair(page, 0, 2)
  await finishDuration(page, MOTION.swap)
  await expect(page.locator('[data-correct-effect]')).toHaveCount(3)
  await expect(slots(page).nth(3)).toHaveAttribute('aria-disabled', 'false')
  await expect(slots(page).nth(0)).not.toHaveClass(/has-right-edge/)
  await expect(slots(page).nth(1)).not.toHaveClass(/has-right-edge/)
  await finishDuration(page, MOTION.correct)
  await expect(page.locator('[data-correct-effect]')).toHaveCount(0)
  await expect(slots(page).nth(0).locator('.puzzle-tile-image')).toHaveCSS(
    'filter',
    'brightness(0.5)',
  )
  await expect(page.locator('.puzzle-moving-tile')).toHaveCount(0)
})

test('最后交换先收尾局部效果，落位后完整反馈一次，完成操作与焦点在结束后保留', async ({ page }) => {
  await controlAnimations(page)
  await seedPuzzle(page, { ...fixtureState, tiles: [1, 0, 3, 2, 4, 5, 6, 7, 8] })
  const board = page.locator('.puzzle-board')
  await clickPair(page, 0, 1)
  await finishDuration(page, MOTION.swap)
  await expect(page.locator('[data-correct-effect]')).toHaveCount(2)
  await slots(page).nth(2).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  // 第 1 行的末格不跨行；用方向下、左、左到第 2 行第 1 格。
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(board).toHaveAttribute('data-phase', 'swapping')
  await expect(page.locator('[data-correct-effect]')).toHaveCount(0)
  await expect
    .poll(async () => (await readSnapshot(page))?.state.tiles)
    .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  await expect(page.getByText('拼图完成', { exact: true })).toHaveCount(0)
  await finishDuration(page, MOTION.swap)
  await expect(board).toHaveAttribute('data-phase', 'completing')
  await expect(page.locator('.puzzle-full-image')).toHaveCount(0)
  await expect(
    page.locator('[data-correct-effect], .has-right-edge, .has-bottom-edge'),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新打乱', exact: true })).toBeDisabled()
  await expect(page.getByText('拼图完成', { exact: true })).toHaveCount(0)
  await finishDuration(page, MOTION.complete)
  await expect(board).toHaveAttribute('data-phase', 'completed')
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  await expect(slots(page).nth(3)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '再来一局' })).toBeFocused()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await page.reload()
  await expect(board).toHaveAttribute('data-phase', 'completed')
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('非法释放连续返回来源，不提交不保存，正常 lostcapture 不提前取消返回', async ({ page }) => {
  await controlAnimations(page)
  await seedPuzzle(page)
  const before = await readSnapshot(page)
  const box = (await slots(page).nth(0).boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x - 10, box.y + 25)
  await expect(page.locator('.puzzle-floating-tile')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'returning')
  await expect(page.locator('.puzzle-floating-tile')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '换张图片' })).toBeDisabled()
  expect(await readSnapshot(page)).toEqual(before)
  await finishDuration(page, MOTION.return)
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'ready')
  await expect(page.locator('.puzzle-floating-tile, .is-moving, .is-drag-source')).toHaveCount(0)
  expect(await readSnapshot(page)).toEqual(before)
})

test('已提交交换的失焦、尺寸变化和原生动画取消均保留结果与存档，不遗留锁', async ({ page }) => {
  await controlAnimations(page)
  await seedPuzzle(page)
  for (const [index, pair] of [
    [0, 1],
    [3, 4],
    [6, 7],
  ].entries()) {
    await clickPair(page, pair[0]!, pair[1]!)
    await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'swapping')
    await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(8 + index)
    const saved = await readSnapshot(page)
    if (index === 0) await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else if (index === 1) await page.setViewportSize({ width: 1000, height: 720 })
    else await page.evaluate(() => document.getAnimations().forEach((a) => a.cancel()))
    await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'ready')
    await expect(
      page.locator('.puzzle-moving-tile, .puzzle-floating-tile, .is-moving'),
    ).toHaveCount(0)
    expect(await readSnapshot(page)).toEqual(saved)
    expect(
      await slots(page).evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('aria-label')),
      ),
    ).toEqual(
      saved!.state.tiles.map(
        (tile, slot) =>
          `第 ${Math.floor(slot / 3) + 1} 行，第 ${(slot % 3) + 1} 列，图块 ${tile + 1}，${tile === slot ? '已归位' : '未归位'}`,
      ),
    )
  }
})

test('动态切换 reduced motion 安全收尾，完成与新局即时稳定，恢复不重播', async ({ page }) => {
  await controlAnimations(page)
  await seedPuzzle(page, { ...fixtureState, tiles: [1, 0, 3, 2, 4, 5, 6, 7, 8] })
  await clickPair(page, 0, 1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'ready')
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await clickPair(page, 2, 3)
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'completed')
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await expect.poll(async () => (await readSnapshot(page))?.state.moves).toBe(9)
  await page.reload()
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: '再来一局' }).click()
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'ready')
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('完成反馈中断直接完成；新局入场及原图淡入淡出按阶段开放', async ({ page }) => {
  // 操作栏保持在视口内，避免点击自动滚动按产品约定提前收尾入场动画。
  await page.setViewportSize({ width: 1280, height: 1000 })
  await controlAnimations(page)
  await seedPuzzle(page, { ...fixtureState, tiles: [1, 0, 2, 3, 4, 5, 6, 7, 8] })
  await clickPair(page, 0, 1)
  await finishDuration(page, MOTION.swap)
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'completing')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByText('拼图完成', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: '再来一局' }).click()
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'entering')
  await finishDuration(page, MOTION.enter)
  await page.getByRole('button', { name: '查看原图' }).click()
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'original-in')
  await expect(page.getByRole('button', { name: '换张图片' })).toBeDisabled()
  await finishDuration(page, MOTION.original)
  await page.getByRole('button', { name: '返回拼图' }).click()
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'original-out')
  await expect(slots(page).nth(0)).toHaveAttribute('inert', '')
  await finishDuration(page, MOTION.original)
  await expect(page.locator('.puzzle-full-image')).toHaveCount(0)
  await expect(page.locator('.puzzle-board')).toHaveAttribute('data-phase', 'ready')
})
