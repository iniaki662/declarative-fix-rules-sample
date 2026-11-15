// 评测可信度披露器 —— 样例实现。
//
// 用途：给「模型输出是否成立」这个判定，提供一组必须随分数一起报出的披露项。
// 核心立场：**机会水平不是合理的对照**。留出集分布不均衡时，
// 「恒猜众数」的准确率可以远超机会水平，而一个只会输出众数的退化策略
// 照样能拿到漂亮数字。因此众数基线必须与分数同时披露，
// 分数与机会水平的差值（Δ、z）永远不足以单独支撑「学到了决策」的结论。
//
// 本文件是**方法样例**：目标数据为自造，用于演示披露口径与判据结构。
// 真实工程中的实现见另一套代码，未公开。

// ── 披露项封闭集 ───────────────────────────────────────────────
// 披露项是封闭集：新增一项必须改这里，否则报告契约会漂。
export const DISCLOSURE_IDS = [
  'D1-provenance',        // ① 数据出处核对：自称的出处 vs 实际文件
  'D2-holdout-disjoint',  // ② 留出集与训练集是否真的不相交
  'D3-outcome-check',     // ③ 出处核对结论
  'D4-majority-baseline', // ④ 众数基线（恒猜留出集里最常见的那个动作）
  'D5-label-composition', // ⑤ 标签来源构成与可达性
  'D6-label-learnability',// ⑥ 标签集可学性
];

// ── 字段契约 ─────────────────────────────────────────────────
// 每个披露项的产物字段是封闭的：缺失即判红，不允许静默补默认值。
export const DISCLOSURE_FIELDS = {
  'D1-provenance': ['status', 'recorded', 'actual', 'mismatchedFields'],
  'D2-holdout-disjoint': ['measuredOverlapRows', 'comparable'],
  'D3-outcome-check': ['verdict'],
  'D4-majority-baseline': ['majorityAction', 'majorityShare', 'deltaVsMajority', 'zVsChance'],
  'D5-label-composition': ['sourceCounts', 'reachableActions', 'totalActions'],
  'D6-label-learnability': ['verdict', 'reason'],
};

// ── 算子 ─────────────────────────────────────────────────────

// 众数基线：恒猜留出集里最常见的那个动作。
export function computeMajorityBaseline(rows) {
  if (rows.length === 0) return { majorityAction: null, majorityShare: 0, count: 0 };
  const counts = new Map();
  for (const r of rows) counts.set(r.action, (counts.get(r.action) ?? 0) + 1);
  let majorityAction = null;
  let best = -1;
  for (const [action, n] of counts) {
    if (n > best) {
      best = n;
      majorityAction = action;
    }
  }
  return {
    majorityAction,
    majorityShare: best / rows.length,
    count: best,
    counts,
  };
}

// 机会水平准确率：1 / 动作数。**下界，不是合理对照。**
export function chanceAccuracy(totalActions) {
  if (!totalActions || totalActions <= 0) return 0;
  return 1 / totalActions;
}

// 众数基线与机会水平的差值。Δ 与 z 单独不足以支撑结论，必须与众数基线同时披露。
//
// z 用二项口径：命中数 ~ Binomial(n, chance)
//   z = (命中数 - n·chance) / sqrt(n·chance·(1-chance))
// n 越大 z 越大，所以 z 的绝对值与样本量绑定，不与「策略好坏」绑定。
export function baselineGaps(accuracy, majorityShare, totalActions, n) {
  const deltaVsMajority = accuracy - majorityShare;
  const chance = chanceAccuracy(totalActions);
  const variance = chance * (1 - chance);
  const sampleSize = Number.isFinite(n) && n > 0 ? n : 0;
  const hitCount = sampleSize > 0 ? accuracy * sampleSize : 0;
  const zVsChance =
    sampleSize > 0 && variance > 0
      ? (hitCount - sampleSize * chance) / Math.sqrt(sampleSize * variance)
      : 0;
  return { deltaVsMajority, zVsChance, chance, sampleSize };
}

// 数据出处核对：自称的出处 vs 实际文件。出处对不上时，
// 后续算出来的「没有重叠」是拿一个不相干的集合在证明没有重叠 ——
// 报出去比不报更危险，所以出处不一致时**不测**重叠。
export function verifyProvenance(recorded, actual) {
  const mismatchedFields = [];
  for (const k of Object.keys(recorded ?? {})) {
    if ((actual?.[k] ?? null) !== (recorded[k] ?? null)) mismatchedFields.push(k);
  }
  return {
    status: mismatchedFields.length === 0 ? 'matched' : 'mismatched',
    recorded: recorded ?? {},
    actual: actual ?? {},
    mismatchedFields,
  };
}

// 留出集与训练集是否不相交：仅在出处一致时才测。
export function measureHoldoutOverlap(evalRows, trainPrints) {
  const evalPrints = new Set(evalRows.map((r) => r.obs));
  let overlap = 0;
  for (const p of evalPrints) if (trainPrints.has(p)) overlap += 1;
  return { measuredOverlapRows: overlap, comparable: true };
}

// 标签来源构成与可达性：问「这批标签众数发不发得出来」。
export function labelComposition(rows, totalActions) {
  const sourceCounts = new Map();
  for (const r of rows) sourceCounts.set(r.source, (sourceCounts.get(r.source) ?? 0) + 1);
  const reachable = new Set(rows.map((r) => r.action));
  return {
    sourceCounts: Object.fromEntries(sourceCounts),
    reachableActions: reachable.size,
    totalActions,
  };
}

// 标签集可学性：问更靠前的问题 —— 这批标签本身能不能教会任何东西。
// 与「众数发不发得出来」独立：一批标签可以众数发得出来，同时完全不可学。
export function classifyLabelLearnability(composition, rows) {
  const distinctActions = new Set(rows.map((r) => r.action)).size;
  if (rows.length === 0) {
    return { verdict: 'unlearnable', reason: '样本为空' };
  }
  if (distinctActions <= 1) {
    return {
      verdict: 'unlearnable',
      reason: `标签集只有 ${distinctActions} 个不同动作，模型无从学出区分`,
    };
  }
  if (composition.reachableActions < composition.totalActions) {
    return {
      verdict: 'partially-learnable',
      reason: `标签来源只覆盖 ${composition.reachableActions}/${composition.totalActions} 个动作`,
    };
  }
  return { verdict: 'learnable', reason: '标签来源覆盖全部动作且存在多个不同动作' };
}

// ── 汇总 ─────────────────────────────────────────────────────

// 产出完整披露报告。缺字段即判红 —— 出处缺失由 D1 单独负责报，
// 不在其它栏里静默补默认值。
export function buildDisclosureReport({ evalRows, trainPrints, recorded, actual, accuracy, totalActions }) {
  const provenance = verifyProvenance(recorded, actual);

  const d2 = provenance.status === 'matched'
    ? measureHoldoutOverlap(evalRows, trainPrints)
    : { measuredOverlapRows: null, comparable: false };

  const majority = computeMajorityBaseline(evalRows);
  const gaps = baselineGaps(accuracy, majority.majorityShare, totalActions, evalRows.length);

  const composition = labelComposition(evalRows, totalActions);
  const learnability = classifyLabelLearnability(composition, evalRows);

  const disclosures = {
    'D1-provenance': provenance,
    'D2-holdout-disjoint': d2,
    'D3-outcome-check': {
      verdict: provenance.status === 'matched'
        ? (d2.measuredOverlapRows === 0 ? 'clean' : 'overlap-detected')
        : 'not-measurable',
    },
    'D4-majority-baseline': {
      majorityAction: majority.majorityAction,
      majorityShare: majority.majorityShare,
      deltaVsMajority: gaps.deltaVsMajority,
      zVsChance: gaps.zVsChance,
    },
    'D5-label-composition': composition,
    'D6-label-learnability': learnability,
  };

  // 字段契约校验：缺字段即报。
  const missing = [];
  for (const id of DISCLOSURE_IDS) {
    for (const f of DISCLOSURE_FIELDS[id]) {
      if (!(f in (disclosures[id] ?? {}))) missing.push(`${id}.${f}`);
    }
  }

  return {
    schema: 'eval-disclosure-report/v1',
    accuracy,
    totalActions,
    disclosures,
    missingFields: missing,
    contractSatisfied: missing.length === 0,
  };
}
