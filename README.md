# 工业革命：匹兹堡 · 顺位与计分助手

《工业革命：匹兹堡》（Brass: Pittsburgh）桌游的多人房间工具，线上地址：https://pgh.leisurecat.cloud

- 一桌人进同一个房间，所有手机实时同步；首页列出正在进行的房间，点一下即可加入
- 顺位：每轮记录花费，结算时按花钱从少到多排下一轮顺位，同额保持原相对顺序；两个时代各 8 轮自动推进
- 计分：两个时代的计分条、火车链接、产业板块、多相交流发电机、机车工厂，数字键盘支持加减
- 结算：MVP、得分构成、成就；平分按收入等级、再按现金
- 往期对局：每局结束自动存档（Durable Object `Archive`），`/history` 可按玩家名、角色或房间码搜索
- 新手教程：`/guide`，规则讲解视频（存放在 R2 存储桶 `pgh-media`，经 `/media/rules.mp4` 播放）和 23 节图文讲解

规则依据官方规则书 v2026.01。非官方玩家工具，人物肖像为重新绘制的插画。

## 结构

| 路径 | 说明 |
|---|---|
| `public/` | 页面（静态资源）：`index.html`、`app.js`、`style.css`、`img/` |
| `public/logic.js` | 规则与状态逻辑，页面和服务端共用 |
| `src/worker.js` | Cloudflare Worker：建房接口、`Room`（每个房间一个 Durable Object，WebSocket 同步）、`Lobby`（房间列表）、`Archive`（往期对局） |
| `wrangler.jsonc` | 部署配置，自定义域名 `pgh.leisurecat.cloud` |
| `tests/` | Playwright 多手机测试 |

## 开发与部署

```bash
wrangler dev --port 8799     # 本地运行
wrangler deploy              # 部署到 Cloudflare
```

## 测试

需要本机安装 Chrome 和 `playwright-core`（`npm i playwright-core`）。

```bash
node tests/test_room.mjs  https://pgh.leisurecat.cloud/ ./shots   # 双手机完整 16 轮
node tests/test_room2.mjs https://pgh.leisurecat.cloud/ ./shots   # 4 人局、小屏、加入、撤销、断线、平分等
node tests/test_history.mjs http://localhost:8799/ ./shots --many-rooms   # 往期对局存档、搜索、撤销/重开；房间多时首页按钮仍在首屏
node tests/test_history.mjs https://pgh.leisurecat.cloud/ ./shots --live  # 线上冒烟：打完一局再撤销，不留记录
```

打完整局的测试会在往期对局里留下记录，请对本地 `wrangler dev` 运行（把上面前两条的地址换成 `http://localhost:8799/`）；线上只跑 `--live`。
