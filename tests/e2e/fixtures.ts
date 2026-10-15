import { test as base } from '@playwright/test'

export { expect, type Page } from '@playwright/test'

export const test = base.extend({
  context: async ({ context, browserName, playwright, launchOptions }, use) => {
    if (browserName !== 'webkit' || process.platform !== 'darwin') {
      await use(context)
      return
    }

    // macOS WebKit 的临时会话无法把 Blob 写入 IndexedDB；每例使用独立磁盘会话。
    // 空目录参数由 Playwright 创建并清理临时 profile，测试选项及 trace 仍由 runner 管理。
    const persistent = await playwright.webkit.launchPersistentContext('', launchOptions)
    try {
      await use(persistent)
    } finally {
      await persistent.close()
    }
  },
})
