-- 古琴学习资料站 数据库结构 (SQLite)
PRAGMA foreign_keys = ON;

-- 术语（后台持久管理）
CREATE TABLE IF NOT EXISTS terms (
    id          INTEGER PRIMARY KEY,
            term        TEXT NOT NULL,
    pinyin      TEXT,
    definition  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- 来源 / 参考文献
CREATE TABLE IF NOT EXISTS sources (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    author      TEXT,
    dynasty     TEXT,
    kind        TEXT,                 -- 琴论 / 琴谱 / 现代著作 ...
    note        TEXT,
    created_at  TEXT NOT NULL
);

-- 学习路线节点（依赖图，允许多节点共享同一先修节点）
CREATE TABLE IF NOT EXISTS route_nodes (
    id          TEXT PRIMARY KEY,     -- 如 R1
    title       TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prerequisites (
    id          INTEGER PRIMARY KEY,
    node_id     TEXT NOT NULL REFERENCES route_nodes(id),
    prereq_id   TEXT NOT NULL REFERENCES route_nodes(id),
    created_at  TEXT NOT NULL,
    UNIQUE(node_id, prereq_id),
    CHECK (node_id <> prereq_id)
);

-- 琴史、流派
CREATE TABLE IF NOT EXISTS history_entries (
    id INTEGER PRIMARY KEY, era TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT, summary TEXT NOT NULL, traits TEXT, sort INTEGER DEFAULT 0
);

-- 谱例（曲目）
CREATE TABLE IF NOT EXISTS scores (
    id          TEXT PRIMARY KEY,     -- SC
    title       TEXT NOT NULL,
    attribution TEXT,                 -- 传谱
    intro       TEXT,
    current_version_id INTEGER,
    created_at  TEXT NOT NULL
);

-- 谱例版本
CREATE TABLE IF NOT EXISTS score_versions (
    id          INTEGER PRIMARY KEY,
    score_id    TEXT NOT NULL REFERENCES scores(id),
    version     TEXT NOT NULL,        -- v1, v2
    note        TEXT,
    created_at  TEXT NOT NULL,
    UNIQUE(score_id, version)
);

-- 谱段（谱例锚点；t_in/t_out 可空 = 媒体缺时码）
CREATE TABLE IF NOT EXISTS sections (
    id          TEXT PRIMARY KEY,     -- SC1-v2-s3
    version_id  INTEGER NOT NULL REFERENCES score_versions(id),
    code        TEXT NOT NULL,        -- 版本内标识 A/B/C
    label       TEXT NOT NULL,
    notation    TEXT,                 -- 减字谱文本描述
    t_in        REAL,                 -- 媒体时间(秒)，允许 NULL
    t_out       REAL,
    sort        INTEGER DEFAULT 0,
    UNIQUE(version_id, code)
);

-- 版本迁移映射（旧段 -> 新段；split / merge / same）
CREATE TABLE IF NOT EXISTS section_mappings (
    id              INTEGER PRIMARY KEY,
    from_version_id INTEGER NOT NULL REFERENCES score_versions(id),
    to_version_id   INTEGER NOT NULL REFERENCES score_versions(id),
    old_code        TEXT NOT NULL,
    new_code        TEXT NOT NULL,
    relation        TEXT NOT NULL CHECK (relation IN ('same','split','merge')),
    weight          REAL NOT NULL DEFAULT 1.0  -- split 时旧完成度折算权重
);

-- 音频资源（许可到期后禁止经缓存索引取回）
CREATE TABLE IF NOT EXISTS audios (
    id          TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    title       TEXT,
    license_until TEXT,               -- ISO 时间；NULL=永久
    created_at  TEXT NOT NULL
);
-- 音频与版本绑定（旧版本授权到期场景）
CREATE TABLE IF NOT EXISTS version_audio (
    version_id INTEGER NOT NULL REFERENCES score_versions(id),
    audio_id   TEXT NOT NULL REFERENCES audios(id),
    PRIMARY KEY(version_id, audio_id)
);
-- 缓存索引：服务端在签发音频时登记，到期即删除索引
CREATE TABLE IF NOT EXISTS audio_cache_index (
    cache_key   TEXT PRIMARY KEY,
    audio_id    TEXT NOT NULL REFERENCES audios(id),
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

-- 发布事件（发布 / 回退全程可审计）
CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY,
    score_id TEXT NOT NULL REFERENCES scores(id),
    action TEXT NOT NULL CHECK (action IN ('publish','rollback')),
    from_version_id INTEGER,
    to_version_id INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
);

-- 账号
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
);

-- 事件溯源式学习记录（合并 + 幂等去重的唯一事实来源）
CREATE TABLE IF NOT EXISTS progress_events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),   -- NULL 表示由匿名导入产生
    anon_id TEXT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('section','node')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('check','uncheck')),
    occurred_at TEXT NOT NULL,              -- 设备上的事件时间（合并排序依据）
    device_id TEXT,
    client_event_id TEXT,                   -- 幂等去重键
    received_at TEXT NOT NULL,
    UNIQUE(client_event_id)
);
CREATE INDEX IF NOT EXISTS idx_pe_lookup ON progress_events(user_id, entity_type, entity_id, occurred_at);

-- 合并后的投影状态（含冲突审计列）
CREATE TABLE IF NOT EXISTS progress_states (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    last_occurred_at TEXT,
    last_device_id TEXT,
    -- 对照策略：最后修改覆盖（按状态推送时间戳）
    lww_completed INTEGER,
    lww_state_ts TEXT,
    conflict_flag INTEGER NOT NULL DEFAULT 0,
    conflict_detail TEXT,
    UNIQUE(user_id, entity_type, entity_id)
);

-- 换版迁移结果（后台可查）
CREATE TABLE IF NOT EXISTS migration_results (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    from_version_id INTEGER NOT NULL,
    to_version_id INTEGER NOT NULL,
    new_code TEXT NOT NULL,
    status TEXT NOT NULL,   -- inherited / partial / not_met / new
    detail TEXT,
    created_at TEXT NOT NULL
);

-- 服务端许可控制的分享链接
CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    score_id TEXT NOT NULL REFERENCES scores(id),
    version_id INTEGER REFERENCES score_versions(id),
    allow_print INTEGER NOT NULL DEFAULT 0,
    allowed_audios TEXT,                     -- 逗号分隔 audio id；空=不含音频
    created_by INTEGER REFERENCES users(id),
    expires_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress_snapshots (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    anon_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    completed INTEGER NOT NULL,
    modified_at TEXT NOT NULL,
    device_id TEXT,
    received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ps_lookup ON progress_snapshots(user_id, entity_type, entity_id, modified_at);
