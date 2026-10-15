# puzzle

一个正在实现的单人 Web 拼图游戏。选择三张原创内置图之一或上传自己的图片，配置 3×3 至 6×6 网格、辅助或随机开局，通过两次点选交换图块。支持归位锁定、查看原图、换图与重新打乱。

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

单独运行规则与会话测试使用 `pnpm test`，开发时可用 `pnpm test:watch` 监听变更。图片在浏览器内处理，当前进度仅保留在内存中，刷新会丢失；保存恢复、拖动、键盘协调与时间动效按 PR 计划继续实施。

- [开发指南](docs/development.md)：安装、命令、提交钩子与验证方式。
- [首版规格](docs/specs/web-puzzle-v1.md)：玩法、行为参数与验收要求。
- [PR 实施计划](docs/specs/web-puzzle-v1-pr-plan.md)：当前进度、依赖和各项验证记录。
- [文档索引](docs/index.md)：全部项目文档。
