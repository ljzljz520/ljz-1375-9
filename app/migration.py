"""谱例换版：旧完成记录保留，是否满足新版要求必须经映射判断。

规则：
- same（同段/改名）：旧段完成则新段满足；
- merge（多旧段 -> 一新段）：所有被映射旧段都完成才算满足，部分完成 partial；
- split（一旧段 -> 多新段）：按 weight 折算，weight<1 表示新段包含新增内容，只能 partial；
- 新版中没有任何入边映射的段：new（不继承，需重新练习）；
- 旧版已完成但在新版被删除（无出边映射）：归档记录 archived，原事件记录绝不删除。
status 集合：inherited / partial / not_met / new；旧段另记 archived。
"""
from collections import defaultdict

INHERITED, PARTIAL, NOT_MET, NEW = "inherited", "partial", "not_met", "new"
ARCHIVED = "archived"


def evaluate_migration(old_completed, new_codes, mappings):
    """mappings: 可迭代 dict(old_code,new_code,relation,weight)
    返回 dict(new_code -> (status, detail))，以及 dropped 旧段列表。
    """
    incoming = defaultdict(list)   # new_code -> [(old_code, relation, weight)]
    outgoing = defaultdict(list)   # old_code -> [new_code...]
    for m in mappings:
        incoming[m["new_code"]].append((m["old_code"], m["relation"], float(m["weight"])))
        outgoing[m["old_code"]].append(m["new_code"])

    results = {}
    for code in new_codes:
        ins = incoming.get(code)
        if not ins:
            results[code] = (NEW, "新版新增段落，无旧段映射，不能继承")
            continue
        relations = {r for _, r, _ in ins}
        done = [o for o, _, _ in ins if o in old_completed]
        if "merge" in relations or len(ins) > 1:
            # 合并段：必须所有来源旧段都完成
            if len(done) == len(ins):
                results[code] = (INHERITED,
                                 f"合并段，{len(done)}/{len(ins)} 个来源旧段均已完成")
            elif done:
                results[code] = (PARTIAL,
                                 f"合并段仅 {len(done)}/{len(ins)} 个来源旧段完成，不满足新要求")
            else:
                results[code] = (NOT_MET, "合并段来源旧段均未完成")
        else:
            old_code, relation, weight = ins[0]
            if old_code not in old_completed:
                results[code] = (NOT_MET, f"来源旧段 {old_code} 未完成")
            elif weight >= 1.0:
                results[code] = (INHERITED, f"同段/改名映射自 {old_code}，完成度完整继承")
            else:
                results[code] = (PARTIAL,
                                 f"由 {old_code} 拆分，折算权重 {weight:g}<1，含新增内容，需补练")

    dropped = []
    for old in sorted(old_completed):
        if not outgoing.get(old):
            dropped.append(old)
    return results, dropped
