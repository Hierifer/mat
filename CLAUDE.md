# Materm

Tauri v2 terminal app (Rust backend + Vue 3 frontend, pnpm).

## 发版流程 (Release Process)

**发版必须打 tag** — push 一个 `v*` tag 才会触发 `.github/workflows/release.yml` 构建并发布（macOS/Linux/Windows）。只 merge 到 main 不会发版。

步骤：

1. 更新版本号：`package.json` 和 `src-tauri/Cargo.toml`（`tauri.conf.json` 不用改，CI 会从 tag 自动同步三处版本）
2. 提交 `chore: bump version to X.Y.Z` — changelog 生成脚本依赖此 commit 格式作为版本边界（changelog 由 git hook 在每次 commit 后自动重新生成，也可手动 `npm run changelog`）
3. 打 tag 并推送：

   ```sh
   git tag vX.Y.Z
   git push origin main --tags
   ```

## 项目文档

修改功能前先阅读 `docs/` 下的对应文档，了解现有设计再动手：

- `docs/STUDIO_MODE.md` — Studio 模式（项目 + 分支工作区 + Agent）
- `docs/AUTO_UPDATE_DESIGN.md` — 自动更新系统
- `docs/NOTIFICATIONS.md` — 通知系统
- `docs/SPEECH_RECOGNITION.md` — 语音识别
- `docs/CLAUDE_COMMAND_MONITORING.md` — Claude 命令监控

## 常用命令

- `pnpm install` — 安装依赖（项目用 pnpm，不要用 npm install，会生成多余的 package-lock.json 并升级依赖）
- `npm run tauri:dev` — 启动开发应用
- `npm run typecheck` / `npm run test` / `npm run build` — 类型检查 / vitest / 前端构建
