// 行为级验收脚本共用工具：判定一条声明式规则在目标上「是否已生效」。
//
// 背景：规则以「已应用形态」被验收——验收发生在规则落地之后，
// 因此判据不能写成「find 串还在目标里」（落地后 find 必然消失）。
//
// 约定两条：
//   1. find 串必须规则应用前后逐字节相同 ⇒ find 只能取自目标原始形态；
//   2. replace 串若以 find 串为前缀 ⇒ 必须带 appliedWhen 条件。
//
// 落地后实际形态有三种，逐一给出判据：
//
//   A. find ⊂ replace 且 replace 不含 find ⇒ find 已从目标消失，
//      且 replace 形态整体命中。
//   B. find ⊂ replace（find 是 replace 的一部分）⇒ find 的残留属 replace 内部
//      的正常残留，不能用「find 计数 == 0」判定；改判 replace 命中 +
//      appliedWhen 标记命中。
//   C. 形态经 migrate 演进过的 edit ⇒ 新形态（replace）命中即已应用，
//      migrate.from 不再命中（幂等）。
//
// 通用判据（对 A/B/C 都成立）：
//   - 已应用形态命中：replace 串在目标里，或 appliedWhen 全部标记命中；
//   - appliedWhen 标记本身在目标里命中（appliedWhen 非空时）。

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function countOf(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

// 按 locator.mustContainAll 在目标目录内定位唯一文件。
// 语义定位而非文件名定位：文件被改名或重新分块后，规则依然命中。
export function locateByMarks(dir, marks) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    if ((marks ?? []).every((m) => src.includes(m))) {
      return { file: join(dir, f), src };
    }
  }
  return { file: null, src: '' };
}

// 逐 edit 判定「该 edit 的已应用形态是否已在目标中命中」。
// ok 是断言回调 (name, cond, extra) —— 由各验收脚本决定成败口径。
export function assertRuleShape(rule, src, ok) {
  for (const e of rule?.edits ?? []) {
    const marks = e.appliedWhen ?? [];
    const replaceHit = countOf(src, e.replace) > 0;
    const appliedWhenHit = marks.length > 0 && marks.every((m) => src.includes(m));
    const findResidual = countOf(src, e.find);

    // 形态 C：migrate 演进 —— 新形态命中且旧形态已消失
    if (e.migrate?.from) {
      ok(`${e.id}:migrate-new-shape`, replaceHit, { replaceHit });
      ok(`${e.id}:migrate-old-gone`, countOf(src, e.migrate.from) === 0, {
        residual: countOf(src, e.migrate.from),
      });
      continue;
    }

    // 形态 A：replace 不含 find ⇒ find 应已清零
    if (!e.replace.includes(e.find)) {
      ok(`${e.id}:find-cleared`, findResidual === 0, { residual: findResidual });
      ok(`${e.id}:replace-hit`, replaceHit, { replaceHit });
      continue;
    }

    // 形态 B：replace 以 find 为前缀 ⇒ find 可残留，靠 replace + appliedWhen 判定
    ok(`${e.id}:replace-hit`, replaceHit, { replaceHit });
    if (marks.length > 0) {
      ok(`${e.id}:appliedWhen-hit`, appliedWhenHit, { appliedWhenHit, marks });
    }
  }
}

// 统一的验收结论输出。返回 true 表示全部断言通过。
export function report(ok, name, failures) {
  const failed = failures.filter((f) => !f.pass);
  if (failed.length === 0) {
    console.log(`PASS  ${name}  (断言 ${ok.length} 条)`);
    return true;
  }
  console.log(`FAIL  ${name}`);
  for (const f of failed) {
    console.log(`  - ${f.name}  ${JSON.stringify(f.extra ?? {})}`);
  }
  console.log(`  失败 ${failed.length}/${ok.length} 条断言`);
  return false;
}
