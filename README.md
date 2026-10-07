# 丝桐课 · 古琴学习资料站

Web 呈现**琴史、流派、谱例与音频**；后端 API 持久管理**术语、来源、先修关系**；
学习进度可**匿名本地保存**并选择**同步到账号**。纯 Python + Flask + SQLite，前端为原生 HTML/CSS/JS，无构建步骤。

## 运行

```bash
python3 seed.py            # 初始化并填充种子数据（幂等，会重建库）
python3 run.py --port 8000 # http://127.0.0.1:8000
```

- 管理员：`admin / admin123` ；普通用户：`student / stud1234`
- 无 pip 时可用 `get-pip.py --user --break-system-packages` 安装 Flask（本项目仅依赖 Flask）。
- 测试：`python3 -m pytest tests/ -q`

## 需求落实对照

| 需求 | 实现 |
| --- | --- |
| 学习路线是允许共享节点的依赖图 | `prerequisites` 有向图，多节点可指向同一先修；`GET /api/route` |
| 新增先修关系检测循环 | `app/graph.py` DFS 环检测（自环 + 间接环），API 返回 409 与环路径 |
| 换版后旧完成记录保留，是否满足需映射判断 | `app/migration.py`：`same/merge/split` 权重映射，结果 `inherited/partial/not_met/new`，旧段 `archived`；从不清空、不全部继承；结果落 `migration_results` |
| 比较事件合并与最后修改覆盖 | 事件按 `occurred_at` 折叠为权威态；状态快照按 `modified_at` 做 LWW 对照；两结果不一致写 `conflict_flag`，进度页可人工裁决 |
| 跨设备去重及冲突处理 | `client_event_id` 幂等 + 内容指纹去重；两设备离线勾选后同步，返回去重数与冲突报告 |
| 音频减速/段落跳转/谱段锚点用媒体时间同步 | `player.js`：0.5–1× 变速、按 `t_in/t_out` 跳转与 `timeupdate` 高亮当前谱段 |
| 旧版本授权到期不能通过缓存索引重新取音频 | `app/media.py`：每次缓存键取流都重新校验授权，失效即删除 `audio_cache_index` 行并返回 410；回退旧版本时主动清索引并告警 |
| 匿名进度合并到账号 | 本地事件队列 + 快照（`storage.js`），`POST /api/progress/merge-anonymous` 导入、去重、统一对账 |
| 两个设备离线勾选 | 离线写 localStorage，恢复联网 `online` 自动/手动 `progress/sync` |
| 谱段拆分 | 种子中《流水》v1 段 A 拆为 v2 的 A1/A2（weight=0.5 → partial）；C+D 合并为 E；F 为新版新增 |
| 媒体缺时码 | v2 段 A2 `t_in/t_out=NULL`，`has_timecode=false`，前端禁用跳转、仅文本 |
| 发布回退 | `POST /api/scores/<id>/publish/<vid>` 记录 `releases(publish/rollback)`；回退到授权到期版本时文字可读、音频拒绝并清缓存 |
| 页面可无音频阅读、打印谱例 | 所有内容接口公开；打印 CSS；打印与分享链接受服务端许可控制（403/404），非仅前端隐藏 |
| 分享链接受服务端许可控制 | `share_links`：有效期/撤销/打印位/音频白名单；`/api/share/<token>/print`、`/audio/<aid>/cache-key` 服务端裁决 |
| 后台列出依赖缺项与版本迁移结果 | `GET /api/admin/missing-dependencies`（传递先修缺口）、`/api/admin/migration-results`，后台页面两个标签页 |

## 目录

```
app/        后端：db/util/graph/migration/sync/media/services/api/views/auth
web/        templates 与 static（JS：storage/api/auth/sync/player/各页面）
tests/      26 个单元 + 端到端验收测试
schema.sql  21 张表
seed.py     琴史/流派/术语/来源/路线/谱例版本映射/授权（含已到期）音频
media/      由 seed 生成的演示 WAV
```

## 关键数据模型

- `route_nodes / prerequisites`：依赖图；
- `score_versions / sections / section_mappings`：版本、谱段（时间码可空）、迁移映射；
- `audios / version_audio / audio_cache_index`：授权与缓存索引；
- `progress_events / progress_snapshots / progress_states / migration_results`：事件溯源 + LWW 快照 + 投影 + 换版判定；
- `releases / share_links`：发布回退审计与分享许可。
