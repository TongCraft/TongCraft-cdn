# Tongcraft CDN

[![Cloudflare](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/cloudflare.yml/badge.svg?branch=main)](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/cloudflare.yml)
[![TongCraft](https://img.shields.io/badge/TongCraft-Skin%20Gallery-3269aa)](https://tongcraft-cdn.3159415804.workers.dev/)
![Views](https://hits.sh/github.com/TongCraft/TongCraft-cdn.svg?label=views&color=3269aa)

Tongcraft 服务器玩家头像与皮肤展示站点。自动从 Mojang 获取皮肤、生成头像，通过 Cloudflare Workers Static Assets 发布。

**站点：** https://tongcraft-cdn.3159415804.workers.dev/

## 功能

- 搜索和浏览玩家头像，复制头像链接或 Minecraft 头颅指令。
- 在 Three.js 3D 查看器中预览皮肤，支持旋转、缩放、动画和部位显示控制。

## 本地运行

需要 Node.js 24.13+。

```bash
npm ci
npm run fetch
npm run web
```

打开 http://localhost:3000。`fetch` 会生成 `avatars/` 和 `skins/` 中的图片；这两个目录及 `dist/` 都不提交。

| 命令 | 用途 |
| --- | --- |
| `npm run add-player -- 玩家名` | 将玩家加入 `data/players.json` |
| `npm run fetch` | 更新全部玩家的皮肤和头像 |
| `npm run build` | 导出静态站点到 `dist/`，供 Cloudflare 部署 |
| `npm run build:pages` | 保留的静态构建命令别名 |
| `npm run dev:cloudflare` | 使用 Wrangler 在本地验证静态站点 |
| `npm run deploy` | 构建后部署到 Cloudflare |
| `npm run check:network` | 构建后检查内容哈希、缓存、跨域、HEAD 和 ETag/304 |
| `npm run check:deploy` | 校验 Cloudflare 配置，不上传 |
| `npm run check:types` | 生成 Cloudflare 类型并检查 Worker |
| `npm run check:3d` | 检查 3D 查看器的显示和交互 |

## Cloudflare 与缓存

`wrangler.jsonc` 将 `dist/` 作为 Workers Static Assets 发布。HTML、头像、皮肤和打包后的 React / Three.js 都存储在 Cloudflare，由其静态资源缓存分发，不通过 Worker 代理 GitHub，也不需要 R2 或 KV。`src/worker.js` 仅处理未命中的请求及不支持的方法，返回不缓存的 404 / 405，防止缺失文件继承长缓存。浏览器正常预览不依赖外部脚本 CDN；站内皮肤加载失败时保留 Mojang HTTPS 原图作为最后回退。访问计数在页面加载后延迟执行，并设有超时。

| 资源 | 浏览器缓存 | 更新方式 |
| --- | --- | --- |
| `assets/` 下带内容哈希的 JS 和图片 | 一年，`immutable` | 内容变化时 URL 自动变化 |
| `avatars/<UUID>.png`、`skins/<UUID>.png` | 5 分钟，过期后可在后台重验证时复用旧内容至多 1 小时 | 保持固定链接，部署新资源后刷新 |
| `players.json`、`3d/<UUID>.json` | 1 分钟，后台重验证窗口 5 分钟 | 部署时更新 |
| HTML | 每次重验证，支持 ETag | 刷新页面即可获得新资源地址 |

图片与名单允许跨域读取。`players.json` 中的 `avatarPath`、`skinPath` 是相对于站点根目录的带版本资源地址；外部网站可用 `new URL(player.avatarPath, 'https://你的域名/')` 生成地址，也可以使用原来的固定头像链接。

本地部署：先运行 `npm run fetch`，然后 `npx wrangler login`、`npm run deploy`。构建会检查全部玩家的头像和皮肤是否齐全，缺少图片时停止，避免发布不完整站点。当前只启用 `workers.dev` 测试地址，没有配置自定义域名。Cloudflare 全球边缘缓存能减少回源和重复下载，国内实际速度仍需按访问线路测试。

## 自动部署和玩家管理

[Deploy Cloudflare](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/cloudflare.yml) 统一负责更新皮肤、维护图片缓存和发布站点，不依赖 GitHub Pages。

首次配置需要在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 添加：

- Repository variable `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare 账号 ID。
- Repository secret `CLOUDFLARE_API_TOKEN`：允许部署目标 Worker 的 API Token。令牌只保存在 Actions Secret，不写入代码或构建产物。

推送到 `main` 会自动构建并发布；每天北京时间 04:17 会刷新全部玩家的皮肤和头像，再部署到 Cloudflare。GitHub 定时任务可能延迟执行。

手动刷新或添加玩家：打开 **Actions → Deploy Cloudflare → Run workflow**，使用 `main` 分支：

- `players` 留空：刷新现有玩家的皮肤和头像，并部署。
- `players` 填写玩家名：可用空格、逗号或换行分隔；先添加玩家，再刷新全部图片，检查通过后将玩家数据提交回仓库并部署。

工作流会恢复上一次的 `avatars/`、`skins/` 缓存。Mojang 暂时不可用时可以复用已有图片；如果缺少任意玩家的头像或皮肤，构建会停止，避免发布残缺站点。皮肤内容变化时，页面中的图片哈希地址自动变化，无需手动清理 Cloudflare 长缓存。
