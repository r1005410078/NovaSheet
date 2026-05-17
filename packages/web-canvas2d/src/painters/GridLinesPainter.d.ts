/**
 * GridLinesPainter——绘制可见区的水平 / 垂直分隔线（spec §5.5）。
 *
 * 优化：所有同色线合并到一次 ctx.beginPath()+stroke()——600 个 cell 范围内大约
 * 几十条线一次描边，远比 per-line stroke 快。线坐标采用 `floor + 0.5` 对齐避免亚像素模糊。
 *
 * 边界正确性：rowHeight / colWidth 通过 axis.getSize(index) 取值，而非
 * indexToPosition(index+1) - indexToPosition(index)——后者在末行/末列因 clamp 返回 0
 * （CLAUDE.md 不变量 #7，M1 hardening 修复）。
 *
 * scrollOffsetX/Y 由 Renderer 从 viewport.snapshot() 取出后传入；冻结象限传 0 即可。
 */
import type { Axis, QuadrantRect, Theme } from '@novasheet/core';
/** 网格线绘制所需参数 */
export interface GridLinesPaintParams {
    /** 行轴（提供行高与位置查询） */
    rowsAxis: Axis;
    /** 列轴（提供列宽与位置查询） */
    colsAxis: Axis;
    /** 可见行索引区间（两端均闭，来自 Axis.getVisibleRange） */
    rowRange: [number, number];
    /** 可见列索引区间（两端均闭） */
    colRange: [number, number];
    /** 象限矩形（canvas 坐标系） */
    rect: QuadrantRect;
    /** Horizontal scroll offset to subtract from content X positions; 0 for frozen quadrants */
    scrollOffsetX?: number;
    /** Vertical scroll offset to subtract from content Y positions; 0 for frozen quadrants */
    scrollOffsetY?: number;
}
/**
 * 行/列分隔线绘制。把所有同色线合并到一次 ctx.stroke——而非每行/列各 stroke 一次——
 * 大幅降低 Canvas 状态机切换开销（实测 30 行 × 20 列下从 ~1.5ms 降到 ~0.3ms）。
 */
export declare class GridLinesPainter {
    private theme;
    constructor(theme: Theme);
    /** 切换主题 */
    setTheme(theme: Theme): void;
    /** 绘制可见行列的底边与右边网格线（像素对齐 + 0.5 偏移，消除模糊） */
    paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void;
}
//# sourceMappingURL=GridLinesPainter.d.ts.map