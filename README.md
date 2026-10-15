# puzzle

一个正在实现的单人 Web 拼图游戏。当前完成 PR01 工程基础，页面仅展示准备状态。

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

`ci` 会生成 `dist/`，生产预览默认位于 <http://localhost:4173>。端口被占用时以终端输出为准。

- [开发指南](docs/development.md)：安装、命令、提交钩子与验证方式。
- [首版规格](docs/specs/web-puzzle-v1.md)：玩法、行为参数与验收要求。
- [PR 实施计划](docs/specs/web-puzzle-v1-pr-plan.md)：当前进度、依赖和各项验证记录。
- [文档索引](docs/index.md)：全部项目文档。
