"""换版迁移：same/merge/split/new/archived；旧记录保留、不简单清空或全部继承。"""
from app.migration import evaluate_migration


def test_same_inherited():
    res, dropped = evaluate_migration({"A"}, ["A"],
                                      [{"old_code": "A", "new_code": "A", "relation": "same", "weight": 1.0}])
    assert res["A"][0] == "inherited"
    assert dropped == []


def test_merge_requires_all_sources():
    maps = [
        {"old_code": "C", "new_code": "E", "relation": "merge", "weight": 1},
        {"old_code": "D", "new_code": "E", "relation": "merge", "weight": 1},
    ]
    partial, _ = evaluate_migration({"C"}, ["E"], maps)
    assert partial["E"][0] == "partial"       # 只完成一个来源 → 不满足
    full, _ = evaluate_migration({"C", "D"}, ["E"], maps)
    assert full["E"][0] == "inherited"
    none, _ = evaluate_migration(set(), ["E"], maps)
    assert none["E"][0] == "not_met"


def test_split_is_partial_even_when_old_completed():
    maps = [
        {"old_code": "A", "new_code": "A1", "relation": "split", "weight": 0.5},
        {"old_code": "A", "new_code": "A2", "relation": "split", "weight": 0.5},
    ]
    res, _ = evaluate_migration({"A"}, ["A1", "A2"], maps)
    assert res["A1"][0] == "partial"
    assert res["A2"][0] == "partial"


def test_unmapped_new_section_not_inherited():
    # F 在新版没有任何入边映射 → new，绝不自动完成
    res, _ = evaluate_migration({"A"}, ["F"],
                                [{"old_code": "A", "new_code": "A1", "relation": "split", "weight": 0.5}])
    assert res["F"][0] == "new"


def test_dropped_old_section_archived_not_deleted():
    # 旧段 X 已完成但在新版无出边映射 → 归档；事件记录仍保留（在服务层保证）
    res, dropped = evaluate_migration({"X"}, ["A"],
                                      [{"old_code": "A", "new_code": "A", "relation": "same", "weight": 1}])
    assert dropped == ["X"]
    assert res["A"][0] == "not_met"  # 旧 X 完成不代表新 A 完成
