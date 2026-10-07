'use strict';
// 谱例换版后的完成记录迁移：旧记录保留（事件流不删改），
// 是否满足新版要求必须依据管理员给出的 section 映射逐条判定。

/**
 * mapping: [{ from: oldSectionId, to: newSectionId, kind: 'same'|'split'|'merge' }]
 *   same   1:1
 *   split  1 个旧段 -> 多个新段（旧段完整完成，每个新段算满足）
 *   merge  多个旧段 -> 1 个新段（所有旧段都完成才算满足，部分为 partial）
 * completedOld: Set<oldSectionId>
 *
 * 返回每个新段的判定与总览。旧段完成记录不删除、不默认继承。
 */
function evaluateMigration(oldVersion, newVersion, mapping, completedOld) {
  completedOld = completedOld || new Set();
  const sourcesByTarget = new Map();
  for (const sec of newVersion.sections) sourcesByTarget.set(sec.id, []);
  const warnings = [];
  for (const m of mapping) {
    if (!oldVersion.sections.some((s) => s.id === m.from)) { warnings.push(`映射源段不存在: ${m.from}`); continue; }
    if (!sourcesByTarget.has(m.to)) { warnings.push(`映射目标段不存在: ${m.to}`); continue; }
    sourcesByTarget.get(m.to).push(m);
  }
  const oldIds = new Set(oldVersion.sections.map((s) => s.id));
  for (const m of mapping) if (!oldIds.has(m.from)) { /* already warned */ }
  // 未被任何映射使用的旧段（可能被废弃）
  const mappedOld = new Set(mapping.map((m) => m.from));
  const unmappedOld = oldVersion.sections.map((s) => s.id).filter((id) => !mappedOld.has(id));

  const perSection = newVersion.sections.map((sec) => {
    const srcs = sourcesByTarget.get(sec.id);
    if (srcs.length === 0) {
      return { sectionId: sec.id, title: sec.title, status: 'new', sources: [] };
    }
    const done = srcs.filter((m) => completedOld.has(m.from));
    let status;
    if (done.length === srcs.length) status = 'satisfied';
    else if (done.length === 0) status = 'unsatisfied';
    else status = 'partial'; // merge 且只完成部分旧段
    return {
      sectionId: sec.id,
      title: sec.title,
      status,
      kind: srcs.length > 1 ? 'merge' : srcs[0].kind,
      sources: srcs.map((m) => ({ sectionId: m.from, kind: m.kind, completed: completedOld.has(m.from) })),
    };
  });

  const counts = { satisfied: 0, partial: 0, unsatisfied: 0, new: 0 };
  for (const r of perSection) counts[r.status]++;
  // satisfied 要求新版所有段落都被旧记录满足；出现新增/部分/不满足一律 partial 总览
  const status = counts.satisfied === perSection.length && perSection.length > 0
    ? 'satisfied'
    : counts.satisfied > 0 ? 'partial' : 'unsatisfied';

  return {
    fromVersionId: oldVersion.id,
    toVersionId: newVersion.id,
    status,
    counts,
    perSection,
    unmappedOldSections: unmappedOld,
    warnings,
  };
}

module.exports = { evaluateMigration };
