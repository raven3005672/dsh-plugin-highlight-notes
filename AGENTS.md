# AGENTS.md

这个仓库给 agent 的固定约定。改动前先看 `README.md` 与 `DESIGN.md` 的对应章节。

## 永远不要

- 在验收服务还开着的时候发版：`pnpm release` 之前必须先关掉所有本地 web 实例（约定端口 `57021` 开发实例、`57022` 发布包验证实例）。
- 直接 `npm publish`：发布只走 tag + `.github/workflows/publish.yml`（Trusted Publishing + provenance）。
- 在 `master` 之外的已发布分支上打 tag。

## 发布前检查清单

1. `git status` 干净，`master` 与 `origin/master` 一致。
2. **关掉验收实例**：把 57021 / 57022 上的 `dsh ... web` 进程停掉，并确认没有其它长跑的后台任务。
3. `pnpm verify` 全绿（`release.mjs` 会自己再跑一遍）。
4. `CHANGELOG.md` 的「未发布」段落能直接当发布说明读。
5. `pnpm release <minor|patch|x.y.z>`：改版本 → 收口 CHANGELOG → 提交 → 打 tag → 推送。
6. CI `publish` 跑完后 `npm view dsh-plugin-highlight-notes dist-tags --json` 确认 `latest`。

`scripts/release.mjs` 自带端口检查：57021 / 57022 仍被监听时它直接失败，并打印停服命令。

## 验收实例（开发用）

```sh
# 起：用本机已安装的 DSH CLI 跑一个临时 profile（不进桌面应用的 profile）
ELECTRON_RUN_AS_NODE=1 dsh --profile notetest --no-open --port 57021

# 停：Ctrl-C，或
pkill -f "dsh-desktop-host/lib/cli.js.*--profile notetest"
```

发布包验证用另一个复制出来的 profile（`notetest-npm`，端口 `57022`），验证完把它删掉。
