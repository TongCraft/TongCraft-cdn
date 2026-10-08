# Tongcraft CDN

[![GitHub Pages](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/pages.yml)
[![TongCraft](https://img.shields.io/badge/TongCraft-Skin%20Gallery-3269aa)](https://tongcraft.github.io/TongCraft-cdn/)
![Views](https://hits.sh/github.com/TongCraft/TongCraft-cdn.svg?label=views&color=3269aa)

Tongcraft 服务器玩家头像与皮肤展示站点。自动从 Mojang 获取皮肤，生成头像，并通过 GitHub Pages 发布。

**站点：** https://tongcraft.github.io/TongCraft-cdn/

## 功能

- 搜索和浏览玩家头像，复制头像链接或 Minecraft 头颅指令。
- 在 3D 查看器中预览皮肤，导出多色 3MF 或单色 STL。

## 本地运行

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
| `npm run build:pages` | 导出静态站点到 `dist/` |
| `npm run check:3d` | 检查 3D 查看器与模型导出 |

## GitHub Pages

在仓库的 **Settings → Pages → Source** 中选择 **GitHub Actions**。推送到 `main`、每日定时任务，或手动运行 [Deploy GitHub Pages](https://github.com/TongCraft/TongCraft-cdn/actions/workflows/pages.yml) 都会更新站点。

手动运行时可在 `players` 中填写一个或多个玩家名（空格或逗号分隔）；工作流会添加玩家、更新图片并部署。留空则只刷新现有玩家。
