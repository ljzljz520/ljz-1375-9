"""学习路线：允许共享先修节点的依赖图；新增先修关系做循环检测。"""


class CycleError(ValueError):
    def __init__(self, cycle):
        self.cycle = cycle
        super().__init__("检测到循环依赖: " + " -> ".join(cycle))


class DuplicateEdge(ValueError):
    pass


def edges_as_adj(edges):
    """edges: 可迭代 (node_id, prereq_id)；边 node -> prereq（完成 node 前需先完成 prereq）。"""
    adj = {}
    for node, prereq in edges:
        adj.setdefault(node, set()).add(prereq)
        adj.setdefault(prereq, set())
    return adj


def would_create_cycle(adj, node: str, prereq: str):
    """返回成环路径；无环返回 None。
    新增 node->prereq 后成环，当且仅当 prereq 已可达 node（prereq ~> node），或自环。
    """
    if node == prereq:
        return [node, node]
    # DFS：从 prereq 出发，看能否到达 node
    stack = [(prereq, [prereq])]
    seen = set()
    while stack:
        cur, path = stack.pop()
        if cur == node:
            return path + [prereq]
        if cur in seen:
            continue
        seen.add(cur)
        for nxt in sorted(adj.get(cur, ())):
            if nxt in path:  # 图本身已存在环的保护
                return path + [nxt]
            stack.append((nxt, path + [nxt]))
    return None


def add_edge(edges, node: str, prereq: str):
    """校验并返回新的边集合（list[(node, prereq)]）。共享先修节点天然允许。"""
    adj = edges_as_adj(edges)
    if prereq in adj.get(node, set()):
        raise DuplicateEdge(f"{node} 已存在先修 {prereq}")
    cycle = would_create_cycle(adj, node, prereq)
    if cycle:
        raise CycleError(cycle)
    return list(edges) + [(node, prereq)]


def all_dependencies(adj, node):
    """节点的全部（传递）先修。"""
    out, stack = set(), list(adj.get(node, ()))
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        stack.extend(adj.get(cur, ()))
    return out


def find_missing_prereqs(edges, completed_nodes):
    """返回 {node: [缺失先修...]}：某节点被勾选，但其传递先修未完成。"""
    adj = edges_as_adj(edges)
    done = set(completed_nodes)
    missing = {}
    for node in adj:
        if node not in done:
            continue
        deps = all_dependencies(adj, node) - {node}
        lack = sorted(deps - done)
        if lack:
            missing[node] = lack
    return missing


def direct_graph_view(edges):
    adj = edges_as_adj(edges)
    return {n: sorted(ps) for n, ps in adj.items()}
