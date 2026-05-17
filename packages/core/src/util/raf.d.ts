/**
 * 共享 RAF 调度器（CLAUDE.md 不变量 #5：「一个 Grid 实例只有一个 frameScheduler」）。
 *
 * 同一个 key 的 task 后写覆盖前写（按 key 去重）；不同 key 的 task 在同一帧内
 * 按 Map 插入顺序依次执行。这样多个子系统（scroll / resize / render）能合并到
 * 同一帧 RAF，避免一帧内多次 RAF 触发的开销与时序竞态。
 *
 * 典型 key：
 * - `renderer:flush`（Renderer.invalidate）
 * - `scroll:read`（NativeScroller，M2 引入）
 * - `dpr:resize`（HighDPI 重算，M2+）
 */
export declare class FrameScheduler {
    /** 待执行的任务映射，key → 最新一次注册的回调 */
    private pending;
    /** 当前已申请但未执行的 RAF id，null 表示无待执行帧 */
    private rafId;
    /** 入队（同 key 覆盖）。首个任务入队时启动 RAF。 */
    schedule(key: string, task: () => void): void;
    /** 撤销待执行任务。Grid.destroy → Renderer.destroy 用它清理挂起的绘制。 */
    cancel(key: string): void;
    /** RAF 回调：快照所有待执行任务后清空 pending，顺序执行 */
    private flush;
}
/**
 * 进程级单例 —— **legacy 逃生通道**。
 *
 * 当前架构是「per-Grid scheduler」（CLAUDE.md 不变量 #5）：每个 Grid 实例自己 `new FrameScheduler()`，
 * 在该实例的 Renderer / NativeScroller 之间共享。**不要**把这个单例当成跨 Grid 共享的
 * 总调度器——所有 Renderer 都用 `'renderer:flush'` 作 key，跨实例会互相吞掉对方的 flush；
 * 测试也会因为 RAF stub 在 worker 内污染而互相干扰。
 *
 * 保留它仅为 backward-compat（如有外部代码直接 import 它）；新代码不要消费。
 */
export declare const frameScheduler: FrameScheduler;
//# sourceMappingURL=raf.d.ts.map