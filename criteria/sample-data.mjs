// 样例数据 —— 演示评测可信度披露器的行为。
//
// 数据为自造，但口径对齐真实工程里那个刺眼的实测情形：
//   - 模型可输出 17 类动作；
//   - 留出集 240 行，真值分布 [13, 52, 64, 111] ⇒ 众数动作占 46.25%；
//   - 模型命中 86 行 ⇒ 准确率 35.83%。
//
// 此时 z（对随机机会水平 1/17）= **+19.7**，看起来"统计显著"；
// 但准确率 35.83% **比恒猜众数的 46.25% 还低 10.4 个百分点**。
//
// ⇒ 这正是「Δ 与 z 永远不足以支撑结论；众数基线必须与它们同时披露」的由来。
//   只报 z = +19.7 的报告会把一个劣于恒猜的退化策略读成「学到了决策」。
//
// 标签来源只覆盖 17 类动作中的 4 类 ⇒ 标签集可学性判为 partially-learnable。

// 留出集：动作分布 [13, 52, 64, 111]
export const EVAL_ROWS = [
  ...Array.from({ length: 13 }, (_, i) => ({ obs: `e${i}`, action: 0, source: 'sim' })),
  ...Array.from({ length: 52 }, (_, i) => ({ obs: `m${i}`, action: 1, source: 'sim' })),
  ...Array.from({ length: 64 }, (_, i) => ({ obs: `n${i}`, action: 2, source: 'sim' })),
  ...Array.from({ length: 111 }, (_, i) => ({ obs: `p${i}`, action: 3, source: 'sim' })),
];

// 训练集指纹：与留出集完全不相交（正常情形）
export const TRAIN_PRINTS = new Set(
  Array.from({ length: 286 }, (_, i) => `t${i}`),
);

// 模型可输出的动作总数（标签来源只覆盖其中 4 类）
export const TOTAL_ACTIONS = 17;

// 模型在留出集上命中 86 行 ⇒ 准确率 35.83%
export const MODEL_ACCURACY = 86 / 240;

// 出处核对：自称出处 vs 实际文件
export const RECORDED_PROVENANCE = {
  trajectories: 'train-286.jsonl',
  obsSidecar: 'train-286.obs.jsonl',
  labelPolicy: 'executed',
};

export const ACTUAL_PROVENANCE = {
  trajectories: 'train-286.jsonl',
  obsSidecar: 'train-286.obs.jsonl',
  labelPolicy: 'executed',
};

// 对照情形：出处不一致（obsSidecar 名字对不上）
export const MISMATCHED_ACTUAL_PROVENANCE = {
  trajectories: 'train-286.jsonl',
  obsSidecar: 'train-999.obs.jsonl',
  labelPolicy: 'executed',
};
