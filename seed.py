"""初始化数据库并填充古琴学习资料。幂等：库中已有谱例则跳过。"""
import os
from datetime import datetime, timezone, timedelta
from app.db import connect_direct, init_db, DB_PATH
from app.util import now_iso, hash_password
from app.wavgen import make_wav

FAR_FUTURE = "2031-12-31T00:00:00+00:00"
# 相对“今天”计算，保证演示时确有到期音频
EXPIRED = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(timespec="seconds")
VALID = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(timespec="seconds")


def run(db_path=None):
    path = db_path or DB_PATH
    if os.path.exists(path):
        os.remove(path)
    # 同时移除 WAL 残留，保证种子干净
    for suffix in ("-wal", "-shm"):
        p = path + suffix
        if os.path.exists(p):
            os.remove(p)
    conn = connect_direct(path)
    init_db(conn)
    cur = conn.cursor()
    ts = now_iso()

    # ---- 账号 ----
    for uname, pw, role in [("admin", "admin123", "admin"), ("student", "stud1234", "user")]:
        ph, salt = hash_password(pw)
        cur.execute("INSERT INTO users(username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?)",
                    (uname, ph, salt, role, ts))

    # ---- 琴史 ----
    history = [
        ("先秦", "琴之滥觞", "古琴初见于上古传说，《诗经》已有“窈窕淑女，琴瑟友之”。先秦琴制与今不同，弦数、形制渐定，琴与礼、乐相系，成为士阶层修养之器。", 1),
        ("汉魏", "形制渐定与琴学初兴", "汉代七弦十三徽之制趋于稳定，司马相如、蔡邕等琴家辈出；魏晋嵇康《琴赋》《声无哀乐论》奠定琴乐美学，嵇氏临刑《广陵散》成为千古意象。", 2),
        ("唐", "斫琴盛世与减字谱之始", "唐代雷氏世家斫琴名重一时，“九霄环佩”等名琴传世。曹柔创减字谱，以汉字偏旁组合记录指法音位，琴曲传承由此获得稳定文本。", 3),
        ("宋", "文人琴与琴论集成", "宋代朱文济、郭沔等浙派琴家崛起；朱长文《琴史》为第一部琴史专著，成玉磵、崔遵度等论琴重“韵”与“意”，文人琴学大兴。", 4),
        ("明清", "琴派纷呈与谱籍刊行", "明代朱权辑《神奇秘谱》，为现存最早琴谱专集；严澂创虞山派，主“清微淡远”；徐青山《溪山琴况》二十四况集琴论之大成。清代五知斋、自远堂诸谱续出。", 5),
        ("近现代", "打谱、传承与新生", "管平湖、查阜西、吴景略等琴家组织查夷平主持的琴人调查与打谱，使绝响之曲复鸣；2003 年古琴艺术入选联合国教科文组织人类非物质文化遗产代表作名录。", 6),
    ]
    cur.executemany("INSERT INTO history_entries(era,title,body,sort) VALUES(?,?,?,?)", history)

    # ---- 流派 ----
    schools = [
        ("虞山派", "江苏常熟", "明末严澂（天池）所创，以《松弦馆琴谱》为代表，倡“清微淡远，中正平和”，重气韵而轻文词，被奉为琴学正宗。", "清、微、淡、远", 1),
        ("广陵派", "江苏扬州", "兴于清初，徐常遇《澄鉴堂琴谱》奠基，五知斋、自远堂琴谱影响深远。节奏自由跌宕，讲究“宛转悠扬”，代表性曲目《梅花三弄》《龙翔操》。", "跌宕自由、刚柔相济", 2),
        ("蜀派（川派）", "四川", "清代张孔山传《流水》“七十二滚拂”，气势奔腾；《天闻阁琴谱》集其成。曲风峻急奔放，与江浙淡远之风相映。", "奔放雄浑、滚拂传神", 3),
        ("九嶷派", "北京", "清末杨宗稷（时百）创于九嶷琴社，著《琴学丛书》，重写实指法与节拍记录，传《渔歌》《广陵散》等大曲。", "指法谨严、节拍明确", 4),
        ("诸城派", "山东诸城", "王溥长、王雩门两支并传，《桐荫山馆琴谱》传世，曲风刚劲古朴，代表曲目《长门怨》《关山月》。", "刚劲古朴、轮指见长", 5),
        ("梅庵派", "山东/南京", "王燕卿、徐立孙一脉，以《梅庵琴谱》名世，主张“声情并茂”，吸收民间音乐，轮指、点拍鲜明，《关山月》《捣衣》为代表。", "声情并茂、节奏鲜明", 6),
    ]
    cur.executemany("INSERT INTO schools(name,region,summary,traits,sort) VALUES(?,?,?,?,?)", schools)

    # ---- 术语 ----
    terms = [
        ("减字谱", "jiǎn zì pǔ", "唐代曹柔所创的琴专用记谱法，取汉字偏旁部首组合为符号，记录弦序、徽位、左右手指法与奏法，不直接记录精确节奏，需打谱与口传心授补足。"),
        ("打谱", "dǎ pǔ", "琴家依据减字谱，通过考证、弹奏与揣摩，将无精确节奏的古谱转化为可演奏曲目的再创作过程，有“大曲三年”之说。"),
        ("滚拂", "gǔn fú", "右手指法：滚为名指自高弦向低弦连续摘出，拂为食指自低弦向高弦抹入，常连用表现流水奔涌，蜀派《流水》“七十二滚拂”最负盛名。"),
        ("二十四况", "èr shí sì kuàng", "徐上瀛（青山）《溪山琴况》提出的和、静、清、远等二十四个审美范畴，是古琴美学与演奏品评的系统纲领。"),
        ("徽位", "huī wèi", "琴面十三个螺钿或玉质标记，标示泛音与按音的音位；十三徽居中为七徽，左右对称。"),
    ]
    cur.executemany("INSERT INTO terms(term,pinyin,definition,created_at,updated_at) VALUES(?,?,?,?,?)",
                    [(t, p, d, ts, ts) for t, p, d in terms])

    # ---- 来源 ----
    sources = [
        ("神奇秘谱", "朱权", "明", "琴谱", "现存最早的古琴谱集，1425 年成书，分太古神品、霞外神品等六十四曲。"),
        ("溪山琴况", "徐上瀛", "明末清初", "琴论", "提出二十四况，集琴乐审美之大成。"),
        ("琴史", "朱长文", "宋", "琴论", "第一部古琴史专著，收录先秦至北宋琴人事迹。"),
        ("五知斋琴谱", "徐祺", "清", "琴谱", "广陵派代表性谱本，记写详尽，节奏处理标注丰富。"),
        ("琴学丛书", "杨宗稷", "清末民初", "现代著作", "九嶷派典籍，指法节拍记录详明，附琴话、琴谱、琴镜。"),
    ]
    cur.executemany("INSERT INTO sources(title,author,dynasty,kind,note,created_at) VALUES(?,?,?,?,?,?)",
                    [(*s, ts) for s in sources])

    # ---- 学习路线节点（共享先修节点的依赖图）----
    nodes = [
        ("R1", "识器：琴制与坐姿", "认识七弦十三徽、岳山、龙龈等部件，掌握调弦与端坐之法。"),
        ("R2", "右手基本指法", "擘、托、抹、挑、勾、剔、打、摘八法。"),
        ("R3", "左手按音与泛音", "吟、猱、绰、注；十三徽泛音取音。"),
        ("R4", "读减字谱", "拆解减字符号结构：弦序—徽位—左右手—奏法。"),
        ("R5", "调弦与听音", "泛音调弦法与基础音准辨别。"),
        ("R6", "入门小曲《仙翁操》", "以散音、按音配合的开指曲。"),
        ("R7", "《关山月》", "梅庵/诸城名曲，轮指与节奏训练。"),
        ("R8", "《梅花三弄》", "泛音主题三次再现，广陵、虞山各有传谱。"),
        ("R9", "《流水》", "蜀派张孔山七十二滚拂，需 R2/R3/R7 扎实。"),
        ("R10", "打谱方法", "据减字谱独立考证节奏与句读的再创作。"),
    ]
    cur.executemany("INSERT INTO route_nodes(id,title,detail,created_at) VALUES(?,?,?,?)",
                    [(i, t, d, ts) for i, t, d in nodes])
    # node -> prereq（共享先修：R2/R3 被多个节点引用）
    edges = [
        ("R2", "R1"), ("R3", "R1"), ("R4", "R1"), ("R5", "R1"),
        ("R6", "R2"), ("R6", "R4"),
        ("R7", "R2"), ("R7", "R6"),
        ("R8", "R3"), ("R8", "R7"),
        ("R9", "R3"), ("R9", "R7"), ("R9", "R2"),
        ("R10", "R4"), ("R10", "R8"),
    ]
    cur.executemany("INSERT INTO prerequisites(node_id,prereq_id,created_at) VALUES(?,?,?)",
                    [(n, p, ts) for n, p in edges])

    # ---- 音频（含已到期授权）----
    media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media")
    audios = [
        ("A-LS-v1", "liushui_v1.wav", "《流水》旧版录音（授权已到期）", EXPIRED),
        ("A-LS-v2", "liushui_v2.wav", "《流水》新版录音（授权有效）", VALID),
        ("A-MH", "meihua.wav", "《梅花三弄》录音", FAR_FUTURE),
        ("A-GSY", "guanshan.wav", "《关山月》录音", FAR_FUTURE),
    ]
    for aid, fn, title, lic in audios:
        make_wav(os.path.join(media_dir, fn), duration=8 + hash(aid) % 5, freq=392 + hash(aid) % 90)
        cur.execute("INSERT INTO audios(id,filename,title,license_until,created_at) VALUES(?,?,?,?,?)",
                    (aid, fn, title, lic, ts))

    # ---- 谱例与版本 ----
    # SC1 流水：v1（旧，3段，绑定到期音频）-> v2（拆分+合并，绑定有效音频）
    cur.execute("INSERT INTO scores(id,title,attribution,intro,current_version_id,created_at) VALUES(?,?,?,?,?,?)",
                ("SC1", "流水", "蜀派 张孔山传谱", "以滚拂写水势：自涓涓细流至澎湃江海。俞伯牙“巍巍乎志在高山，洋洋乎志在流水”。", None, ts))
    cur.execute("INSERT INTO score_versions(score_id,version,note,created_at) VALUES(?,?,?,?)",
                ("SC1", "v1", "旧版三段结构，音频授权已到期（演示缓存索引失效）", ts))
    vid1 = cur.lastrowid
    cur.execute("INSERT INTO score_versions(score_id,version,note,created_at) VALUES(?,?,?,?)",
                ("SC1", "v2", "新版五段：开篇拆分、滚拂合并；新增尾段泛音", ts))
    vid2 = cur.lastrowid
    cur.execute("UPDATE scores SET current_version_id=? WHERE id='SC1'", (vid2,))
    v1_secs = [
        ("A", "起：散音立意", "散挑七弦起调，勾四弦，状水之静。", 0.0, 6.0, 1),
        ("B", "承：按音生澜", "大指九徽勾三，吟猱生韵；绰注上下。", 6.0, 13.0, 2),
        ("C", "转：滚拂初起", "名指滚、食指拂渐密。", 13.0, 20.0, 3),
        ("D", "合：波涛汹涌", "七十二滚拂连续，伏弦收束。", 20.0, 27.0, 4),
    ]
    for code, label, notation, ti, to, sort in v1_secs:
        cur.execute("INSERT INTO sections(id,version_id,code,label,notation,t_in,t_out,sort) VALUES(?,?,?,?,?,?,?,?)",
                    (f"SC1-v1-{code}", vid1, code, label, notation, ti, to, sort))
    # v2: A 拆成 A1/A2；C+D 合并为 E；新增 F
    v2_secs = [
        ("A1", "起·散音（拆分自旧A）", "散挑七弦。", 0.0, 3.0, 1),
        ("A2", "起·勾四（拆分自旧A，新增句读）", "勾四弦带轻吟。", None, None, 2),   # 缺时码
        ("B", "承：按音生澜", "同旧 B，修订吟猱标注。", 3.0, 9.0, 3),
        ("E", "滚拂段（旧 C+D 合并）", "滚拂自初起到七十二滚拂一气呵成。", 9.0, 20.0, 4),
        ("F", "尾：泛音远去（新版新增）", "十三徽泛音轮指，状江流入海。", 20.0, 26.0, 5),
    ]
    for code, label, notation, ti, to, sort in v2_secs:
        cur.execute("INSERT INTO sections(id,version_id,code,label,notation,t_in,t_out,sort) VALUES(?,?,?,?,?,?,?,?)",
                    (f"SC1-v2-{code}", vid2, code, label, notation, ti, to, sort))
    maps = [
        ("A", "A1", "split", 0.5), ("A", "A2", "split", 0.5),
        ("B", "B", "same", 1.0),
        ("C", "E", "merge", 1.0), ("D", "E", "merge", 1.0),
        # 旧版若完成一段 X（不存在则不影响）；新版 F 无入边 = new
    ]
    cur.executemany(
        "INSERT INTO section_mappings(from_version_id,to_version_id,old_code,new_code,relation,weight) VALUES(?,?,?,?,?,?)",
        [(vid1, vid2, o, n, r, w) for o, n, r, w in maps])
    cur.executemany("INSERT INTO version_audio(version_id,audio_id) VALUES(?,?)",
                    [(vid1, "A-LS-v1"), (vid2, "A-LS-v2")])
    cur.execute("INSERT INTO releases(score_id,action,from_version_id,to_version_id,reason,created_at) VALUES(?,?,?,?,?,?)",
                ("SC1", "publish", None, vid1, "初版发布", ts))
    cur.execute("INSERT INTO releases(score_id,action,from_version_id,to_version_id,reason,created_at) VALUES(?,?,?,?,?,?)",
                ("SC1", "publish", vid1, vid2, "拆分开篇、合并滚拂段、新增泛音尾段", ts))

    # SC2 梅花三弄
    cur.execute("INSERT INTO scores(id,title,attribution,intro,current_version_id,created_at) VALUES(?,?,?,?,?,?)",
                ("SC2", "梅花三弄", "虞山派/广陵派 传谱", "泛音主题三次（二弄、三弄）变奏，写梅花凌寒之姿。", None, ts))
    cur.execute("INSERT INTO score_versions(score_id,version,note,created_at) VALUES(?,?,?,?)",
                ("SC2", "v1", "标准版", ts))
    v = cur.lastrowid
    cur.execute("UPDATE scores SET current_version_id=? WHERE id='SC2'", (v,))
    for i, (code, label, ti) in enumerate([
            ("A", "溪山新月（引子）", 0.0), ("B", "一弄·泛音", 5.0),
            ("C", "二弄·琴箫问答", 12.0), ("D", "三弄·梅花怒放", 20.0),
            ("E", "尾声·岁寒守志", 28.0)]):
        cur.execute("INSERT INTO sections(id,version_id,code,label,notation,t_in,t_out,sort) VALUES(?,?,?,?,?,?,?,?)",
                    (f"SC2-v1-{code}", v, code, label, "减字谱文本略（演示）", ti, ti + 6, i + 1))
    cur.execute("INSERT INTO version_audio(version_id,audio_id) VALUES(?,?)", (v, "A-MH"))

    # SC3 关山月
    cur.execute("INSERT INTO scores(id,title,attribution,intro,current_version_id,created_at) VALUES(?,?,?,?,?,?)",
                ("SC3", "关山月", "梅庵派 王燕卿传谱", "短曲写边塞征人，轮指铿锵，适合入门后巩固节奏。", None, ts))
    cur.execute("INSERT INTO score_versions(score_id,version,note,created_at) VALUES(?,?,?,?)",
                ("SC3", "v1", "标准版", ts))
    v = cur.lastrowid
    cur.execute("UPDATE scores SET current_version_id=? WHERE id='SC3'", (v,))
    for i, code in enumerate(["A", "B", "C"]):
        cur.execute("INSERT INTO sections(id,version_id,code,label,notation,t_in,t_out,sort) VALUES(?,?,?,?,?,?,?,?)",
                    (f"SC3-v1-{code}", v, code, f"第{i+1}段", "减字谱文本略（演示）",
                     i * 6.0, i * 6.0 + 5.0, i + 1))
    cur.execute("INSERT INTO version_audio(version_id,audio_id) VALUES(?,?)", (v, "A-GSY"))

    conn.commit()
    conn.close()
    return {"db": path, "users": {"admin": "admin123", "student": "stud1234"},
            "versions": {"SC1": {"v1": vid1, "v2": vid2}}}


if __name__ == "__main__":
    print(run())
