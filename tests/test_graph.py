"""依赖图：共享先修节点允许；自环/成环拒绝。"""
import pytest
from app.graph import add_edge, CycleError, DuplicateEdge, find_missing_prereqs


def test_shared_prerequisite_allowed():
    edges = [("R2", "R1"), ("R3", "R1")]
    edges = add_edge(edges, "R4", "R1")  # R1 被 R2/R3/R4 共享
    assert ("R4", "R1") in edges


def test_self_loop_rejected():
    with pytest.raises(CycleError):
        add_edge([("R2", "R1")], "R1", "R1")


def test_indirect_cycle_detected():
    # R1->R2->R3，试图新增 R1->R3? 方向 node->prereq
    edges = [("R2", "R1"), ("R3", "R2")]
    # 若新增 R1 先修 R3，则 R1->R3->R2->R1 成环
    with pytest.raises(CycleError) as ei:
        add_edge(edges, "R1", "R3")
    cyc = ei.value.cycle
    assert cyc[0] == "R3" and "R1" in cyc


def test_no_false_positive_diamond():
    # 菱形依赖不是环
    edges = [("B", "A"), ("C", "A"), ("D", "B"), ("D", "C")]
    out = add_edge(edges, "E", "D")
    assert ("E", "D") in out


def test_duplicate_edge():
    with pytest.raises(DuplicateEdge):
        add_edge([("R2", "R1")], "R2", "R1")


def test_missing_prerequisites_report():
    edges = [("R2", "R1"), ("R6", "R2"), ("R7", "R6")]
    # 完成 R7 但未完成其传递先修 R1/R2/R6
    miss = find_missing_prereqs(edges, ["R7"])
    assert set(miss["R7"]) == {"R1", "R2", "R6"}
    assert find_missing_prereqs(edges, ["R1", "R2", "R6", "R7"]) == {}
