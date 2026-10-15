# 开发指南

## 环境与安装

仓库是一个 private ESM 应用包。Node.js 使用 24 LTS，具体版本以 [`.node-version`](../.node-version) 为准；pnpm 使用 12，具体版本以 [`package.json`](../package.json) 的 `packageManager` 为准。CI 直接读取这两处版本。

先用本机的 Node 版本管理器安装并切换到 `.node-version` 指定的版本。例如使用 fnm 时，在仓库根目录执行 `fnm install` 和 `fnm use`。然后安装项目指定的 pnpm；以下为 POSIX shell 示例：

```sh
npm install --global "$(node -p "require('./package.json').packageManager")"
node --version
pnpm --version
pnpm install --frozen-lockfile
```

安装会通过根包的 `prepare` 安装提交钩子。pnpm 配置集中在 [`pnpm-workspace.yaml`](../pnpm-workspace.yaml)，直接依赖保存为精确版本，安装时检查 Node 和 peer dependency 兼容性。`simple-git-hooks` 的依赖安装脚本已禁用，钩子统一由根包 `prepare` 安装。

应用使用 Vue 3、Vite 和 Tailwind CSS 的官方 Vite 插件。TypeScript 固定在 6.0.3，因为当前 vue-tsc 依赖 TypeScript 的 JavaScript 编译器 API，尚不兼容 TypeScript 7；后续升级应同时验证模板检查。[兼容性记录](https://github.com/vuejs/language-tools/issues/6124)

Vitest 固定在 5.0.1，与现有 Node 24、Vite 8 配合使用；测试配置合并在 `vite.config.ts`，不另设工具链。[Vitest 版本要求](https://vitest.dev/guide/migration/#prerequisites)

新增或升级依赖使用 `pnpm add`、`pnpm add -D` 或 `pnpm update`，一并提交清单和唯一的 `pnpm-lock.yaml`。全新环境和 CI 均按锁文件安装。

## 开发与生产预览

```sh
pnpm dev
```

开发入口默认为 <http://localhost:5173>，支持热更新。当前先展示选图与开局设置，默认彩色几何、4×4、辅助开局。三张内置图和 JPEG、PNG、WebP 上传均可用，点击开始后才建局；棋盘支持两次点选、原图查看、换图和重开。保存恢复、其他输入和时间动效按 [PR 计划](specs/web-puzzle-v1-pr-plan.md) 接入。

生产预览先生成构建，再启动静态预览服务器：

```sh
pnpm build
pnpm preview
```

生产预览默认位于 <http://localhost:4173>，只读取已有 `dist/`，源码变化后需要重新构建。`pnpm run ci` 已包含一次构建，通过后可直接运行 `pnpm preview`。

需要固定端口时，可使用 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort` 或 `pnpm preview --host 127.0.0.1 --port 4173 --strictPort`；端口冲突会退出。默认不使用 `--strictPort` 时，以终端实际输出的地址为准。

Vite 的 `base` 为 `./`，构建产物使用相对资源路径，供域名根路径或子目录部署。`vite preview` 仅供本地验证；本阶段不配置部署平台或上线流程。

## 可用命令

| 命令                | 用途                                                     |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | 启动开发服务器                                           |
| `pnpm format`       | 格式化受支持的源文件与文档，包含导入和 Tailwind 类名排序 |
| `pnpm format:check` | 只检查格式，不修改文件                                   |
| `pnpm lint`         | 运行 oxlint，警告也使检查失败                            |
| `pnpm lint:fix`     | 使用 oxlint 的安全自动修复，剩余警告仍使检查失败         |
| `pnpm typecheck`    | 先检查应用与 Vue 模板，再检查 Node 工具配置              |
| `pnpm test`         | 在 Node 环境运行规则与会话单元测试                       |
| `pnpm test:watch`   | 监听源文件变更并重跑相关单元测试                         |
| `pnpm build`        | 用 Vite 构建一次，输出 `dist/`                           |
| `pnpm preview`      | 在本地预览已有生产构建                                   |
| `pnpm run ci`       | 依次执行格式、lint、类型、单测、构建，失败即停止         |

Vitest 只收集 `src/**/*.test.ts`，使用显式导入的测试 API，无需 DOM 模拟器或浏览器。规则测试使用可注入随机源验证开局与交换不变量；会话测试验证重复和过期提交、点选、重开、候选确认、异步竞争与资源释放。浏览器回归入口在 PR04 接入，当前浏览器验收脚本保留在临时目录，不纳入 CI。

## 图片与候选设置

三张内置图位于 `public/images/`，均为本项目原创静态 PNG。城市窗格与植物静物使用原创矢量形状栅格化，沿用彩色几何的奶油色、珊瑚色、蓝色、深蓝和金色，无外部图片素材。资源目录 `src/puzzle/images.ts` 是 ID、显示名、版本和尺寸的唯一来源。

内置图与上传共用 `normalizeImage`，限制与行为见[图片规格](specs/web-puzzle-v1.md#选择图片)。文件先检查大小、类型与签名，再用 `createImageBitmap` 的 `imageOrientation: 'from-image'` 解码；方向由浏览器处理，不再手动旋转。Canvas 等比缩小、使用 CSS 的 `--color-surface` 铺底并编码 PNG，随后解码核对最终资源尺寸。该 API 也将动画图片取为默认帧或首帧，依据 [HTML 标准](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-createimagebitmap)。方向正确性仍需实际浏览器样本验证，不能只靠 mock。

`usePuzzleSession` 分别持有当前图片和候选图片，设置组件只传入候选配置与操作事件。设置初始借用当前图片，重开继续复用它；关闭候选不会回收仍被棋盘使用的对象 URL。成功开始时交接候选资源，Vue 更新视图后再释放双方都不再引用的旧资源。卸载按资源对象去重释放，`release()` 本身也可重复调用。

每次选择图片、关闭设置或建立新局都会使旧请求失效。浏览器解码不能主动中止，旧任务结束后立即释放结果，不能更新候选、错误提示或当前局面。失败时保留原局与上次预览，开始按钮禁用，用户可重新选图；网格和开局方式只在明确开始时提交。当前不写入 IndexedDB，刷新恢复在 PR04 接入。

## 类型与样式约定

应用的 [`tsconfig.json`](../tsconfig.json) 继承 Vue 官方 DOM 配置，仅显式加载 Vite 客户端类型，启用严格模板检查；[`tsconfig.node.json`](../tsconfig.node.json) 只检查 Vite 配置，使用 Node 类型和 NodeNext 模块解析。两者都开启 `strict` 与 `noUncheckedIndexedAccess`，不输出编译文件。Vite 构建不代替类型检查。

Vue 逻辑使用 `<script setup lang="ts">`，显式导入并使用相对路径。布局与响应式优先使用完整的 Tailwind 静态类名；主题颜色统一在 [`src/styles.css`](../src/styles.css) 维护。

oxlint 启用 TypeScript、Vue、Vitest 以及默认的 Unicorn、Oxc 内置插件，以 correctness 类别和 `typescript/no-explicit-any` 规则检查代码。Vue 文件的 lint 范围是脚本块，模板类型由 vue-tsc 检查；模板交互和可访问性由后续浏览器验收覆盖。

oxfmt 使用两个空格、单引号、无分号，开启导入排序与基于 `src/styles.css` 的 Tailwind 排序。依赖、锁文件、构建产物和测试报告不参与格式化。

## 提交钩子

`pre-commit` 只执行 `pnpm exec lint-staged`，配置与文件匹配规则均在 `package.json`：

- JS、TS、Vue 暂存文件依次执行 `oxlint --fix --deny-warnings` 和 `oxfmt`。
- CSS、HTML、JSON、YAML、Markdown 等其他匹配文件只执行 `oxfmt`。
- 两组扩展名不重叠，命令仅接收 lint-staged 传入的文件列表。

保留 lint-staged 的默认备份、部分暂存保护和修复结果自动暂存。它会临时隐藏部分暂存文件中的未暂存修改，处理完成后恢复；不要传入关闭这些保护的选项。若修复与未暂存内容冲突，提交会失败，应按 lint-staged 输出处理并检查工作区。

修改钩子配置后执行 `pnpm exec simple-git-hooks` 刷新。提交钩子不运行全量类型检查或构建，提交前按影响自行执行 `pnpm run ci`。

## CI 与验证范围

[GitHub Actions](../.github/workflows/ci.yml) 在 PR、main 推送和手动触发时运行单个 Ubuntu job，使用只读仓库权限、pnpm store 缓存，并取消同一 PR 或分支的旧任务。CI 设置 `SKIP_INSTALL_SIMPLE_GIT_HOOKS=1`，按锁文件安装后运行 `pnpm run ci`，不安装钩子或浏览器，不生成覆盖率报告，不上传构建归档。

按变更行为选择验证。规则与会话逻辑通过单元测试检查，图片切片、点选、对话框焦点和页面适配在实际浏览器中检查；验收辅助脚本不加入仓库。实际结果维护在 [PR 实施记录](specs/web-puzzle-v1-pr-plan.md)。视觉反馈与手机实测留到首版整体验收，模拟视口不能替代真机结论，也不阻塞此前 PR 的实施和合并。
