# 丝桐 · 古琴学习资料站

Web 展示琴史、流派、谱例与音频；后端 API 持久管理术语、来源和先修关系；
学习进度可匿名本地保存并选择同步到账号。

## 运行

```bash
npm install
npm start            # http://localhost:3000  （PORT 可改）
npm test             # node --test，31 个用例
```

演示账号：

| 角色 | 名称 | 口令 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 学员 | `u-student` | `student123` |

数据存于 `data/db.json`（首次启动自动播种）；删除即恢复初始数据。
测试使用独立的 `data/test-db.json`（`DB_PATH` 环境变量可覆盖）。

## 需求落点

### 学习路线：允许共享节点的依赖图 + 循环检测
- 学习路线是有向图，边 `节点 -> 先修节点`；同一先修可被多个节点共享（图中红色边）。
- `server/graph.js` 的 `checkPrerequisite` 在新增先修时检测自环、重复边与环；
  成环返回闭环路径，API 返回 `409 CYCLE`。
- 层级 `level(n)=1+max(level(prereq))`，共享节点只计一次；
  `dependencyGaps` 列出悬挂边（依赖缺项）与未满足先修。

### 谱例换版：旧完成记录保留，映射判定
- 勾选是**不可变事件**，换版绝不清空、也不全部继承。
- 管理员在“后台→谱例换版”新建版本草稿时给出旧段→新段映射：
  `same`（1:1）、`split`（一段拆多段）、`merge`（多段并一段）。
- `server/migration.js` 逐段判定 `satisfied / partial / unsatisfied / new`；
  发布与回退都会对每份学习档案执行判定并留档，后台“依赖缺项/迁移结果”可查。
- 谱例页直接展示当前档案对现行版的迁移判定。

### 跨设备同步：事件合并 vs 最后修改覆盖
- `server/events.js`：
  - 事件溯源合并：按 `eventId` 去重、折叠无状态变化的冗余操作，
    基于客户端操作时的 `base` 检出离线并发冲突并留痕，按最新时间决胜但保留全部历史。
  - LWW：各设备上传完整文档 + 修改时间，时间戳大者整体覆盖，**不产生冲突记录**。
  - `POST /api/sync/compare` 对同一组输入给出两种策略结果、差异与结论，前端“进度与同步”页可交互对比。
- 匿名进度在本机以事件队列保存（离线可用），上线后整队列同步；
  登录后 `POST /api/progress/anonymous/merge` 去重合并进账号并清空匿名桶。

### 媒体：减速 / 段落跳转 / 谱例锚点 与 授权
- 音频为服务端按种子实时合成的 WAV（无需二进制素材），可真实播放。
- 播放器支持 1×/0.75×/0.5× 减速；点段落跳到时间码，播放时段落高亮跟随。
- manifest 校验“段落数 == 时码数”：
  - `full` 跳转+高亮；`highlight-only`（缺时码，如《仙翁操》）只高亮不跳；无媒体时页面照常阅读。
- 取流需服务端 HMAC 签名令牌（`server/mediaAuth.js`），**作用域绑定谱例版本**。
  旧版本授权到期（《流水》1876 旧本）时：
  - 令牌签发端点与取流端点分别返回 `410`，且统一 `Cache-Control: no-store`；
  - 即使客户端持有尚未过期的缓存索引/token，也无法重新取到音频。

### 服务端许可控制
- 打印：先 `print-token` 再换一次性受保护数据，前端打开带打印样式的窗口；授权到期则 `410`。
- 分享：谱例有 `shareEnabled` 开关（《良宵引》关闭 → `403`）；
  分享链接带签名令牌，随授权失效；公开页 `/share.html` 只读、无音频、不可打印。

## 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/history` `/api/schools` `/api/terms` `/api/sources` | 内容只读 |
| POST/PUT/DELETE | `/api/terms` `/api/sources` | 管理员维护术语与来源 |
| GET | `/api/graph` | 依赖图、层级、完成态、悬挂边 |
| POST/DELETE | `/api/graph/edges` | 新增（循环检测）/删除先修 |
| GET | `/api/scores/:id/versions/:vid/manifest` | 段落 + 媒体时码 + 取流令牌（许可校验） |
| POST | `/api/scores/:id/versions` `/publish` `/rollback` | 换版、发布、回退（迁移判定留档） |
| GET | `/api/scores/:id/migration` | 当前档案的换版映射判定 |
| GET | `/api/media/:id/stream?token=` | 签名取流（版本授权 + no-store） |
| POST | `/api/progress/events` | 匿名(clientId)或账号事件同步（去重/冲突） |
| POST | `/api/progress/anonymous/merge` | 匿名进度合并到账号 |
| POST | `/api/sync/compare` | 事件合并 vs LWW 对比 |
| GET | `/api/admin/gaps` | 后台：依赖缺项 + 版本迁移结果 |

## 验收场景（`tests/acceptance.test.js`）

1. 匿名进度合并到账号（去重/冲突留痕/匿名桶清空）
2. 两台设备离线勾选后上线去重合并
3. 谱段拆分：旧记录保留，映射判定满足度
4. 媒体缺时码：锚点降级（highlight-only），无音频仍可读
5. 新版本发布迁移留档 + 发布回退（完成事件不删）

另含：旧授权到期无法经缓存索引取流、API 循环检测、打印/分享服务端许可。
