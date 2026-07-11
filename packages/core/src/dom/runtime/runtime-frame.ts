/**
 * GridRuntime 与各 controller 共享的 render frame 类型别名（GridRuntime 拆分 Task 2）。
 *
 * 之前每个文件各自 `ReturnType<GridEngine['getFrame']>` 派生一份，容易漂移；
 * 现在统一从这里 import，只在此处派生一次。
 */

import type { GridEngine } from '../../engine/GridEngine'

/** 一次 `engine.getFrame()` 返回的完整渲染帧快照。 */
export type RuntimeRenderFrame = ReturnType<GridEngine['getFrame']>

/** 当前活跃的单元格编辑会话（`frame.cellEdit` 非空时的收窄类型）。 */
export type RuntimeCellEdit = NonNullable<RuntimeRenderFrame['cellEdit']>
