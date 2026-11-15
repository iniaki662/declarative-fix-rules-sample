// 自造样例目标文件（demo target）—— 槽位持有进程的存活探测与回收。
//
// 缺陷形态：持有进程已退出时槽位被永久占用，不做收口。

export class SlotRegistry {
  constructor() {
    this.slotState = "occupied";
    this.ownerPid = 0;
  }

  livenessProbe(pid) {
    return { isAlive: () => pid > 0 };
  }

  reclaim(task, owner) {
    if (owner.livenessProbe.isAlive()) return task.slotState;
    return task.slotState;
  }
}
