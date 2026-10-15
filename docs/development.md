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

开发入口默认为 <http://localhost:5173>，支持热更新。当前先读取本地存档；无有效存档时展示选图与开局设置，默认彩色几何、4×4、辅助开局。三张内置图和 JPEG、PNG、WebP 上传均可用，点击开始后才建局；棋盘支持鼠标、触控笔、触摸拖动、两次点选与键盘操作，以及原图查看、换图和重开。动效参数遵循[视觉与动效合同](specs/web-puzzle-v1.md#视觉与动效合同)，有效存档直接恢复稳定局面，不重播动画。

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
| `pnpm typecheck`    | 先检查应用与 Vue 模板，再检查工具配置与 E2E 类型         |
| `pnpm test`         | 在 Node 环境运行规则、会话与存档结构单元测试             |
| `pnpm test:watch`   | 监听源文件变更并重跑相关单元测试                         |
| `pnpm build`        | 用 Vite 构建一次，输出 `dist/`                           |
| `pnpm preview`      | 在本地预览已有生产构建                                   |
| `pnpm test:e2e`     | 构建一次，再执行 Chromium 浏览器回归                     |
| `pnpm test:e2e:all` | 构建一次，再执行 Chromium、Firefox、WebKit 回归          |
| `pnpm run ci`       | 依次执行格式、lint、类型、单测、构建，失败即停止         |

Vitest 只收集 `src/**/*.test.ts`，使用显式导入的测试 API，无需 DOM 模拟器或浏览器。规则测试使用可注入随机源验证开局与交换不变量；输入测试覆盖矩形命中、分隔线、小数坐标、阈值和方向键边界。会话测试验证重复和过期提交、手势中断、点选、重开、候选确认、异步竞争、启动恢复、提交快照与资源释放。存档结构在 Node 中校验，图片真实解码、尺寸核对与 IndexedDB 事务由浏览器验证。

## 输入与焦点

操作规则以[输入规格](specs/web-puzzle-v1.md#输入行为)为准。Tab 在棋盘中只有一个停靠点，方向键移动焦点，Enter 或空格选中、交换或取消同格，Escape 取消选择；归位格可聚焦但不能激活。长图先点选来源，从棋盘外侧滚动，再点选目标；所有程序化格位聚焦使用 `preventScroll`，完成后确认格仍保留焦点，可正常 Tab 离开并重玩。

`usePuzzleSession` 持有活动指针、按下偏移、来源、目标和会话/提交版本。点选、拖动和键盘统一进入 `commitSwap`，先清除活动手势再提交一次。`PuzzleBoard.vue` 只负责 DOM 测量、稳定容器捕获、焦点与绘制；跟手更新使用 `requestAnimationFrame`，释放时丢弃排队绘制并重新命中。`src/puzzle/input.ts` 维护纯坐标和方向键计算，棋盘外框使用不占尺寸的 outline，DOMRect 对应内容区域。

棋盘的 `touch-action: pinch-zoom` 保留页面缩放；两侧既有留白使用独立命中区，避免 Chromium 把外侧触点修正到图块按钮，阻断滚动。没有活动图块手势的滚动、外侧指针取消保留选择。活动手势的取消、捕获丢失、滚动、尺寸变化和旋转会清除选择及提示；窗口失焦或页面隐藏也会取消选择。正常释放先清除活动指针，后到的 `lostpointercapture` 不会撤销提交。

业务提交和保存不依赖视觉回调。图片资源、存档格式和写队列沿用原实现。原生指针及缩放行为参考 [Pointer Events 标准](https://w3c.github.io/pointerevents/)。

## 动效与收尾

`src/puzzle/constants.ts` 集中维护时长、缩放与缓动；颜色和亮度沿用 `src/styles.css` 的变量。`src/puzzle/motion.ts` 定义带会话标识和版本的呈现请求、阶段与原生动画句柄管理。会话仍只通过 `commitSwap` 同步提交排列、步数和保存快照，之后才发布动效请求；逻辑 `completed` 与用于完成文案和操作的 `visualCompleted` 分开。

棋盘保留稳定格位和焦点，拖动浮块交接给落位动画时复用原节点，目标图块使用独立临时节点。底层两格的图片在同一次视图更新中隐藏，落位后恢复；矩形位置取当前内容区域。跟手仅写 transform，每帧最多一次；目标描边节点常驻、只切换透明度，跨格不会反复创建布局对象。

落位、返回、完成反馈期间由会话拒绝输入和换局操作。操作按钮使用 `aria-disabled` 配合入口门禁，避免短暂的原生 disabled 把重玩焦点移到 body。局部归位效果独立于输入门禁，普通落位结束即可继续；最后交换先收尾局部效果，再播放完整反馈。原图淡出期间仍保留覆盖状态，结束后才开放棋盘。

动画的正常结束、取消和不可用都能收尾，主动取消同步释放，不依赖 finish 事件。失焦、隐藏、滚动、旋转和尺寸变化会取消未提交手势；已提交动效直接稳定到最终局面，完成局直接进入完成状态。新局和卸载释放 rAF、动画、临时节点和监听器，版本校验拒绝旧回调。减少动态效果在启动和媒体设置变化时均生效，直接显示稳定位置、亮度、边线和完成结果。

## 图片与候选设置

三张内置图位于 `public/images/`，均为本项目原创静态 PNG。城市窗格与植物静物使用原创矢量形状栅格化，沿用彩色几何的奶油色、珊瑚色、蓝色、深蓝和金色，无外部图片素材。资源目录 `src/puzzle/images.ts` 是 ID、显示名、版本和尺寸的唯一来源。

内置图与上传共用 `normalizeImage`，限制与行为见[图片规格](specs/web-puzzle-v1.md#选择图片)。文件先检查大小、类型与签名，再用 `createImageBitmap` 的 `imageOrientation: 'from-image'` 解码；方向由浏览器处理，不再手动旋转。Canvas 等比缩小、使用 CSS 的 `--color-surface` 铺底并编码 PNG，随后解码核对最终资源尺寸。该 API 也将动画图片取为默认帧或首帧，依据 [HTML 标准](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-createimagebitmap)。方向正确性仍需实际浏览器样本验证，不能只靠 mock。

`usePuzzleSession` 分别持有当前图片和候选图片，设置组件只传入候选配置与操作事件。设置初始借用当前图片，重开继续复用它；关闭候选不会回收仍被棋盘使用的对象 URL。成功开始时交接候选资源，Vue 更新视图后再释放双方都不再引用的旧资源。卸载按资源对象去重释放，`release()` 本身也可重复调用。

每次选择图片、关闭设置或建立新局都会使旧请求失效。浏览器解码不能主动中止，旧任务结束后立即释放结果，不能更新候选、错误提示或当前局面。失败时保留原局与上次预览，开始按钮禁用，用户可重新选图；网格和开局方式只在明确开始时提交。恢复图片直接使用存档中的标准化 Blob，经 `createImageResource` 实际解码、核对宽高后创建对象 URL，不重新缩放或从内置资源地址取图。读取或解码尚未结束时不开放选图与开始操作。

## 本地保存与恢复

数据与用户行为以[保存规格](specs/web-puzzle-v1.md#数据与本地保存)为准。`src/puzzle/storage.ts` 使用原生 IndexedDB；`PuzzleSave` 的 `version`、`image` 与 `state` 构成单条快照，`createPuzzleSave` 显式挑选字段并复制排列，排除对象 URL、候选、选择和动效状态。外部读取结果是 `unknown`，先做结构校验，再经图片模块解码。

会话初始化只读取一次；没有记录则准备默认候选，有有效记录则直接恢复稳定局面。只有明确新局和唯一交换入口提交后调用保存，先更新内存，再进入本页写队列。队列以事务 `complete` 为成功，失败节点不会阻塞后续保存；提示只接受当前提交版本的回调。坏记录不删除，新局成功写入后才替换。原图、候选更改、取消和无效交换不会保存。

作用域卸载后不再发起排队中的写入，已启动的事务允许完成；连接关闭及迟到的打开/图片回调均有清理。数据库版本变化时主动关闭连接，避免阻塞其他页面。没有依赖页面关闭事件的补写，刷新可能恢复到最后一个已完成事务，尚未保存的操作可能丢失。

记录只在当前浏览器、当前站点内；不同协议、主机或端口（例如开发 5173 与预览 4173）使用不同的存储空间。多个标签页独立游玩，不实时同步；最近一次成功写入决定下次恢复的内容。读取或写入不可用时仍可开局、点选与重开，持续提示在下一次成功保存后清除。

## 浏览器回归

Playwright 固定为 `package.json` 中的精确版本。首次只验证 Chromium 时安装对应引擎；完整交付前再安装其余引擎：

```sh
pnpm exec playwright install chromium
pnpm test:e2e

# PR07 的三引擎回归
pnpm exec playwright install firefox webkit
pnpm test:e2e:all
```

两条测试命令先执行一次 `pnpm build`，再由 Playwright 启动本次 `dist/` 的 `vite preview --host 127.0.0.1 --port 4175 --strictPort`。配置固定 `reuseExistingServer: false`，端口占用即失败，不复用 5173/4173 或其他服务，结束后关闭测试服务。不要在 4175 上保留手动预览；正常开发与预览继续使用各自端口。[Playwright 服务配置](https://playwright.dev/docs/test-webserver)

每例独立浏览器上下文，`tests/fixtures/puzzle.png` 是自生成的 96×64 小图，长图用例在测试侧将它生成竖向 PNG。测试通过真实 IndexedDB 写入合法存档后刷新，从产品恢复入口固定局面，没有产品测试开关。持久用例覆盖点选和拖动的一次提交/保存、非法释放和取消、键盘完成最后一步及重玩焦点、长图外侧滚动后交换，以及原图和取消设置、上传刷新恢复、完成恢复、事务失败后的继续游戏与下一次成功保存、坏图片/尺寸记录保留。动效回归在测试侧暂停真实 Web Animations 时间线，检查落位门禁、局部效果重叠、最后完整反馈、返回、中断和减少动态效果，再按可观测阶段推进；不靠固定休眠。事务中止通过测试侧浏览器 API 注入，不替代真实图片解码。

另有一条 Chromium 专用的触控长图回归，使用移动视口和 CDP 输入验证外侧单指滚动后选择仍保留；Firefox/WebKit 项目明确跳过这条 CDP 用例，仍共用桌面流程。此测试模拟浏览器触控事件，不代表手机实测。其他触控、多指缩放、隐藏和旋转检查的方式及局限见 [PR05 记录](specs/web-puzzle-v1-pr-plan.md#pr05拖动触控键盘与长图操作)。

测试等待可观测 DOM、保存结果或事务状态；`retries: 0`，不使用固定休眠。失败截图和 trace 在 `test-results/`，HTML 报告在 `playwright-report/`，均已忽略；可用 `pnpm exec playwright show-report` 或 `pnpm exec playwright show-trace <trace.zip>` 查看。需要保留一次运行的证据时，先复制到独立目录，再运行下一轮。更细的事务时序验收脚本保留在临时目录，实际路径与结果见 [PR04 记录](specs/web-puzzle-v1-pr-plan.md#pr04本地保存与浏览器回归入口)。常规 CI 不安装或执行浏览器。

## 类型与样式约定

应用的 [`tsconfig.json`](../tsconfig.json) 继承 Vue 官方 DOM 配置，仅显式加载 Vite 客户端类型，启用严格模板检查；[`tsconfig.node.json`](../tsconfig.node.json) 检查 Vite、Playwright 配置与 E2E 文件，使用 Node 类型、浏览器回调所需的 DOM 类型和 NodeNext 模块解析。两者都开启 `strict` 与 `noUncheckedIndexedAccess`，不输出编译文件。Vite 构建不代替类型检查。

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

按变更行为选择验证。规则与会话逻辑通过单元测试检查，图片切片、点选、对话框焦点和页面适配在实际浏览器中检查；少量关键回归维护在 `tests/e2e/`，专项验收辅助脚本留在临时目录。实际结果维护在 [PR 实施记录](specs/web-puzzle-v1-pr-plan.md)。视觉反馈与手机实测留到首版整体验收，模拟视口不能替代真机结论，也不阻塞此前 PR 的实施和合并。
