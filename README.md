# puzzle

一个单人 Web 拼图游戏。选择三张原创内置图之一或上传自己的图片，配置 3×3 至 6×6 网格、辅助或随机开局，通过拖动、两次点选或键盘交换图块。支持归位锁定、查看原图、换图、重新打乱和刷新后恢复最近一局。

使用 `.node-version` 指定的 Node.js 和 `package.json` 中 `packageManager` 指定的 pnpm。首次配置环境见[开发指南](docs/development.md#环境与安装)。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

开发服务器默认位于 <http://localhost:5173>。检查与本地生产预览：

```sh
pnpm run ci
pnpm preview
```

`ci` 会生成可直接静态托管的 `dist/`，运行时无需 Node 服务。生产预览默认位于 <http://localhost:4173>，端口被占用时以终端输出为准。根路径与子目录的本地复核步骤见[开发指南](docs/development.md#静态交付与路径复核)。

图片和最近一局通过 IndexedDB 保存在当前浏览器的当前站点，不上传服务器或跨设备同步。刷新会恢复最后一个已完成保存事务的局面；保存仍在进行时可能恢复到上一步。存储失败会持续提示，本局仍可继续游玩。原图、换图设置与取消流程继续可用。

鼠标、触控笔和单指均可拖动；键盘用 Tab 进入棋盘，方向键移动，Enter 或空格选中及交换，Escape 取消。长图可以先点选来源，从棋盘外侧滚动页面，再点选目标。浏览器双指缩放保持可用，拖到边缘不会自动滚屏。

单独运行规则、输入、会话与存档校验使用 `pnpm test`，开发时可用 `pnpm test:watch`。浏览器回归使用 `pnpm test:e2e`（Chromium）或 `pnpm test:e2e:all`（三引擎），首次需按[开发指南](docs/development.md#浏览器回归)安装对应浏览器。两条命令均先构建一次，再独立使用 4175 端口，结束后关闭。

PR07 实现与父协调内容审查通过；发布、检查及合并状态以[实际 PR 记录](https://github.com/LoTwT/puzzle/pulls?q=is%3Apr+head%3Atest%2Fpuzzle-pr07-acceptance)为准。首版整体验收仍未完成，实际浏览器、真机及最终视觉反馈的结果与缺口统一记录在[首版验收记录](docs/acceptance/web-puzzle-v1.md)。

- [开发指南](docs/development.md)：安装、命令、提交钩子与验证方式。
- [首版规格](docs/specs/web-puzzle-v1.md)：玩法、行为参数与验收要求。
- [PR 实施计划](docs/specs/web-puzzle-v1-pr-plan.md)：当前进度、依赖和各项验证记录。
- [首版验收记录](docs/acceptance/web-puzzle-v1.md)：实际验证矩阵、A01 至 A16、证据与剩余验收。
- [文档索引](docs/index.md)：全部项目文档。
