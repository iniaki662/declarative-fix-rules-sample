// 自造样例目标文件（demo target）。刻意模仿「分块产物 + 语义标记」的形态，
// 以便演示 locator 的语义定位能力：文件被改名后规则依然命中。
//
// 缺陷形态共三处：
//   1. 任务处于挂起（pending）阶段时，渲染器整行退化为空白；
//   2. 外部调用超时后静默丢弃该轮；
//   3. 相位机入参没有挂起阶段这一维。
//
// 本文件为原创演示代码，不含任何第三方发行件的字节。

export class RenderPanel {
  constructor(options) {
    this.options = options ?? {};
    this.state = {
      lastError: null,
      hasError: false,
      runtimeStatus: "idle",
    };
    // 任务横幅：面板本来就展示任务状态，所以 task.status 的读取是既有代码，
    // 规则只是把它投影进相位机入参。
    this.banner = { task: { status: "idle" } };
  }

  renderRow() {
    if (this.state.hasError) return this.renderBlankRow();
    return this.renderNormalRow();
  }

  renderBlankRow() {
    return "";
  }

  renderNormalRow() {
    return this.state.runtimeStatus;
  }

  // 缺陷形态：外部调用超时后静默丢弃该轮。
  runRemoteCall(fn, signal) {
    const callTimeout = this.options.callTimeout ?? 30_000;
    const abortSignal = signal;
    const callOutcome = fn(abortSignal);
    if (signal.aborted) return null;
    return callOutcome;
  }
}

export function phaseFor(state, c) {
  const phases = {
    draftInput:/^\/draft(?:\s|$)/iu.test(c.trimStart()),
  };
  return phases.draftInput ? "draft" : "idle";
}
