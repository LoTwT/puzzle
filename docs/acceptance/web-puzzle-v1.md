# Web 拼图游戏首版验收记录

日期：2026-10-16，Asia/Shanghai。PR07 实现与父协调内容审查通过；首版整体验收未完成。实际 Safari、发行版 Firefox、iOS/Android 真机、实际读屏、桌面浏览器页面放大、参考录像直接复核与用户最终视觉反馈仍待完成。

本次从 PR06 合并提交 `12ef1ba3c993644dbb8bb29050e00442d60643c1` 创建 `test/puzzle-pr07-acceptance`。PR01 至 PR06 已合并，GitHub CI 与现有 Cloudflare Pages 检查通过；PR07 发布、检查及合并状态以[实际 PR 记录](https://github.com/LoTwT/puzzle/pulls?q=is%3Apr+head%3Atest%2Fpuzzle-pr07-acceptance)为准。玩法与验收要求以[首版规格](../specs/web-puzzle-v1.md)为准，实施与审查过程见 [PR 计划](../specs/web-puzzle-v1-pr-plan.md)，本文维护实际验收结论。

交付内容是源码与 `dist/` 静态文件，不需要 Node 运行服务、密钥或外部 API。最终代码通过 198 项单测；Playwright 三项目合计 49 通过、2 跳过、0 失败。根路径与 `/puzzle/` 使用同一份最终 dist，四种浏览器构建的 8 组真实 HTTP 流程均通过。模拟输入和引擎测试不能替代真实设备及发行版浏览器结论。

父协调于同日独立执行 `pnpm run ci` 与 `pnpm test:e2e:all`，分别确认 198 项单测通过，以及三引擎 49 通过、2 跳过、0 失败或不稳定用例；构建产物与实施交付清单逐字节一致。内容审查覆盖恢复 Blob 的复制与卸载边界、顺序焦点与门禁、WebKit fixture 及 runner 选项/trace 注入、回归用例和验收结论，未发现可操作的实现缺陷。父协调复核了 8 组生产路径、39 次布局、6 组动效及未改模块的复用证据，并亲自查看 320 几何、1440 复核全页、390 植物、WebKit 落位与稳定完成、Firefox 自然播放联系图。记录为 `/tmp/puzzle-pr07-parent-review.json`，独立验证日志为 `/tmp/puzzle-pr07-parent-ci.log`、`/tmp/puzzle-pr07-parent-e2e.log` 与 `/tmp/puzzle-pr07-parent-e2e.json`；发布前再次核对 12 个文件 SHA256 与该审查快照一致，此后仅更新四份文档的审查/发布状态和本段记录，代码验证继续适用。

## 环境与实际验证矩阵

本机为 macOS 27.0.1（26A434）、arm64；Node.js 24.22.0、pnpm 12.11.2、Playwright 1.64.1、Vite 8.3.4、Vue 3.5.44、Vitest 5.0.1。没有升级工具链，仅补装锁定 Playwright 对应的 Firefox/WebKit。

| 环境或检查                                      | 实际结果                | 方法与边界                                                                                                                                   |
| ----------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run ci`                                   | 通过，198 单测，0 失败  | 格式、lint、两套类型检查、单测、生产构建；修复后完整执行，文档完成后再检查格式与链接                                                         |
| Playwright Chromium 156.0.8078.4，revision 1248 | 17 通过，0 跳过，0 失败 | Chrome Headless Shell；包含一条 CDP 触控长图模拟                                                                                             |
| Playwright Firefox 157.0，revision 1555         | 16 通过，1 跳过，0 失败 | Playwright 引擎构建；跳过仅限 Chromium CDP 触控用例，桌面长图照常执行                                                                        |
| Playwright WebKit 27.2，revision 2370           | 16 通过，1 跳过，0 失败 | macOS 每例独立临时磁盘 profile，保留真实 IndexedDB Blob；同样只跳过 CDP 用例，不等同 Safari                                                  |
| 本机 Google Chrome 155.0.8059.41                | 已测桌面流程通过        | 启动 `/Applications/Google Chrome.app` 对应的 Playwright `channel: 'chrome'`，无头执行两种路径、图片、布局和动效；另开有头窗口核实页面可操作 |
| 本机 Safari 27.0.1（22625.1.29.11.28）          | 未验证页面行为          | `safaridriver` 可用，但创建 session 返回 500，明确要求开启“Allow remote automation”；未更改该系统/浏览器设置                                 |
| 发行版 Firefox / 独立 Chromium 应用             | 未安装，未验证          | 已检查本机应用目录；已安装 Chrome 和 Playwright 引擎分别记录，不替代缺失的发行版                                                             |
| iOS Safari / Android Chrome 真机                | 未验证                  | `xctrace`、`devicectl` 只列本机和模拟器；`idevice_id -l/-n`、`adb devices -l` 无连接设备；没有将模拟器计作真机                               |
| 实际读屏、OS 切后台和设备旋转                   | 未验证                  | DOM 标签/焦点/礼貌播报属性、事件及媒体模拟已有结果；未操作真实读屏软件或设备生命周期                                                         |
| 桌面页面放大                                    | 未验证                  | 有头 Chrome 的页面键盘 `Meta+Equal` 未改变 DPR、布局视口或缩放值；没有把 CDP pinch 或调整 viewport 当作浏览器菜单缩放                        |

常规 CI 仍为单 job，不安装浏览器、不运行 E2E、不建立覆盖率矩阵。本地三引擎命令独占 4175，测试结束后已关闭。版本与命令的复现入口见[开发指南](../development.md)。

## 生产路径与交付物

仓库外的临时静态服务器把真实 `dist/` 同时挂载到 `http://127.0.0.1:4180/` 和 `http://127.0.0.1:4180/puzzle/`，不使用 SPA 回退或网络 mock。浏览器实际请求挂载路径下的 HTML、JS、CSS 和 `images/*.png`；另以 HTTP 响应字节的 SHA256 对照 dist 文件清单，确认两条路径交付相同文件。

Chromium、Firefox、WebKit 和本机 Chrome 各执行两种路径，每组均验证：

- 首次默认 4×4、辅助开局，页面和样式实际呈现。
- 彩色几何、城市窗格、植物静物分别加载、开始并刷新恢复；图片解码成功，保存字节与恢复前一致。
- 非法上传显示具体错误，开始按钮禁用，原局存档不变；重新选择有效 PNG 后错误消失、可以开局。
- 上传后交换一次并刷新，图片、配置、排列与步数恢复一致，无页面运行异常。

两种路径分别使用全新浏览器上下文。真实使用时，同协议、主机和端口下的 `/` 与 `/puzzle/` 共享 IndexedDB 最近一局，不是两个隔离的存档空间。文件清单位于证据目录的 `dist-manifest.json`；入口为 `index.html`、`assets/index-CcTjY5XY.js`、`assets/index-F3Ww5w15.css` 和三张 PNG。本地生产预览继续使用既有 4173 进程，源码变化后须按[构建与路径复核步骤](../development.md#静态交付与路径复核)重新构建。

## 本轮修复与测试取舍

两处产品修复均来自实际 WebKit 失败，保留了失败截图、trace 和修复后的回归：

1. 恢复后的数据库 Blob 再次保存，可能留下不可读取的文件引用。独立浏览器探针观察到步数已提交、Blob 大小正常，但读取字节报 `NotFoundError`，刷新后无法恢复。恢复入口现在只复制一次原 PNG 字节到独立 Blob，再解码与复用；存档版本、内容、写队列和事务成功语义不变。新增的继续交换后再次刷新检查保留在原上传恢复用例中，原有取消、事务失败后恢复及全局键盘回归也覆盖这条路径。
2. macOS WebKit 的默认 Tab 策略跳过普通操作按钮，完成后 Tab 会离开页面。原生按钮最小对照确认显式 `tabindex="0"` 可进入顺序焦点，现用于操作栏、对话框和开始按钮。保留 `aria-disabled` 与会话门禁，棋盘仍为单停靠点；没有改系统键盘偏好。

测试环境与断言也作了针对性修正：Firefox 鼠标输入使用整数坐标，保持原偏移断言精度；长图用三次真实滚轮输入并等待实际位置，避免假设所有引擎单次都滚动 1200px；动效阶段用例把操作栏留在视口内，避免自动滚动按产品合同提前收尾。没有固定休眠、增加 retries 或跳过产品要求。

本机 WebKit 的临时内存会话连最小 Blob 写入也失败，磁盘会话对照通过。因此 macOS WebKit 测试每例使用独立临时 profile，由 Playwright 关闭并清理，截图和 trace 仍由 runner 管理。另在原临时内存会话真实触发存储失败，确认持续提示与继续交换均可用；没有 mock 存储，也没有把这种环境计作保存成功。

新增一条完整键盘回归，从九格全部未归位开始，用方向键、空格和 Enter 完成六次交换，再 Tab 重玩。其余完整图片、路径和视觉矩阵使用临时工具，未引入仓库或 CI。

人工查看发现 `interface-geometry-1440.png` 下缘有重复标题。相同尺寸切换流程的复核中，DOM 始终只有一个标题，操作说明的位置正确；视口截图与两次全页截图均未复现。原图保留，1440 宽度的有效画面证据改用 `screenshot-probe-1440-full.png`，对照数据见 `screenshot-probe.json`。目前只能记录为一次未复现的采集异常，不能据此确认产品存在重复节点或已修复渲染缺陷；用户最终视觉验收时继续留意。

## A01 至 A16

下表的“通过”仅表示所列证据及已测桌面环境通过，不宣称整个浏览器/设备矩阵完成。所有新增证据日期均为 2026-10-16；复用证据的日期、环境和适用范围见下一节。`E07` 等编号指向证据表。

| 编号 | 结果               | 方法、证据与限制                                                                                                                                                                                |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01  | 通过               | E02 当前规则单测与 E03 八种网格/开局组合；E07 首次默认设置与三张内置图实际开始。复用组合生成规则，未把随机开局断言为全错位                                                                      |
| A02  | 通过               | E02 纯规则覆盖 0、1、2 块归位及仅两格变化；E07 三引擎合法拖动、点选、保存一次及完整键盘交换                                                                                                     |
| A03  | 通过               | E07 三引擎同格、锁定格、外框、越界释放与取消不改局面；返回动效正常结束，无残留浮层，随后仍可拖动                                                                                                |
| A04  | 通过               | E05 的 5.9px/6px、主指针、触控笔、合成 click 证据与当前输入单测；E07 三引擎一次手势只提交一次                                                                                                   |
| A05  | 通过               | E07 真实 WAAPI 暂停/推进检查落位门禁与独立局部效果；V07 时间帧和自然播放画面确认光效可重叠，不只检查参数                                                                                        |
| A06  | 通过               | E07 最后交换、完成一次、重玩配置、焦点、恢复不重播；V07 完成扫光及最终整图，无残留块或卡锁                                                                                                      |
| A07  | 通过               | E03 取消候选与确认规则；E07 原图一致、覆盖禁止输入、设置取消不改存档；V07 实际原图切换收尾                                                                                                      |
| A08  | 通过，实际读屏待验 | E07 三引擎从全部未归位完整键盘完成并重玩，同时保留边界、锁定格标签、同格取消与焦点回归；未验证 VoiceOver/TalkBack 实际播报                                                                      |
| A09  | 部分验证           | E05 的 Chromium CDP 拖动、双指约 2.76 倍缩放及取消，E07 CDP 外侧单指滚动；均为模拟，iOS/Android 真机未验证                                                                                      |
| A10  | 部分验证           | E05/E06 事件模拟和 E07 三引擎取消、真实窗口尺寸变化、原生 WAAPI 取消保留提交并释放门禁；实际 OS 切后台与设备旋转待验                                                                            |
| A11  | 已测桌面通过       | E03 23 项图片与两条竞争路径；I07 补充 Firefox/WebKit 全部 EXIF 1 至 8、透明底色及横/竖/20:1/1:20 解码，E07 上传错误及跨刷新字节一致；真机解码待验                                               |
| A12  | 已测桌面通过       | E04 事务队列与异常记录；E07 三引擎上传、继续交换再次刷新、完成恢复、坏记录保留、失败后继续保存；C07 WebKit 实际存储不可用仍可玩。实际 Safari/手机持久化待验                                     |
| A13  | 通过               | E07 三引擎运行时切换减少动态效果，位置、完成、焦点与新局即时稳定，动画句柄归零；属于浏览器媒体设置模拟                                                                                          |
| A14  | 部分验证           | I07 三环境共 39 次布局检查及 8 张内置图界面截图，覆盖 320/390/768/1440、6×6 横竖矩形和长图；无横向溢出、两侧至少 16px、最大 640px、操作栏可滚动到达。E05/E07 矩形命中通过；真实桌面页面放大待验 |
| A15  | 部分验证           | V07 已查看拿起、落位 0/90/179ms、归位 140ms、完成 400ms、稳定完成与自然播放采样，未见重复块、闪回或残留；参考录像本次均返回 412，仅复用规格既有调研。直接录像复核与用户最终视觉反馈未完成       |
| A16  | 已测桌面及模拟通过 | E07 三引擎真实鼠标外侧滚轮、来源离屏仍选中、一次交换及不跳回；Chromium CDP 外侧触控通过。E05 证明边缘不自动滚屏；手机跨屏点选仍待真机验证                                                       |

## 证据与复用范围

原始报告、截图、视频、profile 诊断和一次性脚本均在仓库外。以下绝对路径是本机证据位置，不是部署依赖；临时目录不保证长期保存，父协调审查和最终验收应在这些文件仍可访问时进行。

| 编号 | 位置                                                                                                                                                                           | 适用范围                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| E02  | `/tmp/puzzle-pr02-check.slE7aJ/browser.json`、`images.json`、`pixel-diagnostic.json`                                                                                           | 2026-10-15，Chrome 155.0.8059.41；复用纯规则、两格交换及无间隙切片结论；当前 198 项单测重新覆盖规则                                         |
| E03  | `/tmp/puzzle-pr03-evidence/browser.json`、`fixtures/`                                                                                                                          | 2026-10-16，Chrome 155.0.8059.41；复用八种配置、23 项图片处理、文件/像素边界和候选竞争。图片标准化代码未改，首次跨引擎方向与布局由 I07 补测 |
| E04  | `/tmp/puzzle-pr04-evidence/audit-seven-results.json`、`audit.log`                                                                                                              | 2026-10-16，Playwright Chromium 156.0.8078.4；复用顺序写、事务完成语义、读取门禁、关闭与多标签行为；存储模块未改，恢复 Blob 变更由 E07 覆盖 |
| E05  | `/tmp/puzzle-pr05-evidence/audit.json`、`audit-final.log`、`pinch-zoom.png`                                                                                                    | 2026-10-16，Playwright Chromium 156.0.8078.4；复用阈值、矩形边界、侧边触点、缩放、边缘和事件中断；全部触控/旋转/后台结论限于记录的模拟方式  |
| E06  | `/tmp/puzzle-pr06-evidence/visual-audit.json`、`continuity-audit.json`、`performance-6x6.png`                                                                                  | 2026-10-16，Playwright Chromium 156.0.8078.4；棋盘、输入、动效、样式未改，复用每帧至多一次跟手、移动中 0 解码/保存/布局增量及中断卸载结论   |
| E07  | `/tmp/puzzle-pr07-evidence/ci-code.log`、`e2e-final.json`、`final-playwright-report/`、`test-summary.json`                                                                     | 最终代码 198 单测；三项目 49 通过、2 跳过；`tests/e2e/` 为可持续复现入口                                                                    |
| P07  | `/tmp/puzzle-pr07-evidence/mounts.json`、`http.log`、`dist-manifest.json`、`mount-*.zip`                                                                                       | 四种浏览器构建各两种路径，真实 HTTP、资源 SHA256、图片字节、错误恢复与截图；入口 `mounts.mjs`、`static-server.py`                           |
| I07  | `/tmp/puzzle-pr07-evidence/layout-images.json`、`final-interface.json`、`layout-*.png`、`interface-*.png`                                                                      | Chrome 155、Playwright Firefox/WebKit；39 次布局、30 项有效图片检查，8 张内置图界面截图；入口 `layout-images.mjs`、`final-interface.mjs`    |
| V07  | `/tmp/puzzle-pr07-evidence/motion-visual.json`、`visual-*.png`、`visual-*-natural.webm`                                                                                        | Chrome 155、Playwright Firefox/WebKit；各一组暂停时间帧及一组自然播放，查看全尺寸画面与每秒 10 帧联系图；录像开始包含测试存档准备过程       |
| C07  | `/tmp/puzzle-pr07-evidence/installed-browsers.json`、`device-capability.json`、`safari-capability.json`、`capability-checks.json`                                              | 实际浏览器/设备探测、Safari 拒绝原因、WebKit 临时会话失败后可玩，以及真实桌面缩放未被触发的证据                                             |
| R07  | `/tmp/puzzle-pr07-evidence/reference-access.json`                                                                                                                              | 两个原始 Bilibili 地址各尝试一次，HTTP 412；在既有证据中未发现可复用的参考视频文件，没有声称重新观看                                        |
| D07  | `/tmp/puzzle-pr07-evidence/initial-test-results/`、`repaired-test-results/`、`blob-diagnostic-test-results/`、`diagnose.json`、`webkit-probe.json`、`storage-race-traced.json` | 初次 28 通过、2 跳过、18 失败；分离临时会话 Blob 限制、Tab 策略和恢复后文件失效。后续 49 通过为最终结果，初次失败未被删除或计作通过         |

实施交接快照见同目录 `files.sha256`、`handoff.json`、`provenance.json`；发布阶段的最终文件 SHA256、提交与 PR 收据、当前 turn 来源分别见 `publish-files.sha256`、`publish-receipt.json`、`publish-provenance.json`。自身 assistant turn 的精确值为 `gpt-6-astra max`，作用域仅限此次 PR07 session；发布前已从自身当前 turn metadata 重新核实，未沿用父协调身份。

## 剩余整体验收

1. 在实际发行版 Firefox 与 Safari 完成上传、完整键盘游玩、拖动/非法释放、原图/设置、交换后刷新、完成/重玩及减少动态效果。Safari 可由人工直接操作，或由用户决定是否开启远程自动化。
2. 连接 iOS Safari 与 Android Chrome 真机，记录设备、OS 和浏览器版本；检查单指拖动、外侧滚动、双指缩放、长图跨屏、切后台、旋转、连续交换与完成中断，随后刷新核对保存。
3. 用桌面浏览器菜单真实放大页面，检查横向溢出、操作栏、矩形命中与焦点；用 VoiceOver/TalkBack 检查格位状态、归位数量、完成播报和对话框焦点。
4. 可访问参考素材时，直接对照[「赠尔·丽都」](https://www.bilibili.com/video/BV1qY1CYuEq8/)与[「拼出澄辉夏日！」](https://www.bilibili.com/video/BV1MoeKzMEqp/)约 12 至 18 秒，并取得用户对最终界面、节奏与光效的视觉反馈。

完成这些步骤后补写环境、日期、结果与证据，再判断首版整体验收是否完成。它们不阻断已获授权的 PR 交付流程。域名、托管选择、上线部署与现有 Cloudflare 集成修改均不在 PR07 范围内。
