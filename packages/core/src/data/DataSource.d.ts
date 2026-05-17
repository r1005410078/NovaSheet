import type { CellValue, Row, Schema } from './Schema';
/**
 * DataSource 发出的变更事件。Renderer 收到后会 invalidate，触发下一帧重绘。
 * - reset：整体数据变更（setRows 等），通常伴随 rowCountChanged
 * - rowsChanged：部分行内容变更（updateCell、异步分页加载完毕等）
 * - schemaChanged：字段定义变化（M3 加列重排、字段增删时使用）
 * - rowCountChanged：行数变化
 */
export type DataSourceEvent = {
    type: 'reset';
} | {
    type: 'rowsChanged';
    startIndex: number;
    endIndex: number;
} | {
    type: 'schemaChanged';
} | {
    type: 'rowCountChanged';
    newCount: number;
};
/** 数据源事件监听器 */
export type DataSourceListener = (event: DataSourceEvent) => void;
/**
 * 渲染引擎与数据后端之间的通用抽象。同/异步双兼容——
 * M1 内置同步实现 InMemoryDataSource；M4+ 接入服务端分页源时，新实现仍是这个接口，
 * 调用方（Renderer / Grid）零改动（CLAUDE.md ADR）。
 */
export interface DataSource {
    /** 返回总行数 */
    getRowCount(): number;
    /** 返回 Schema（字段定义列表） */
    getSchema(): Schema;
    /**
     * 区间预热通道。Renderer 每帧调一次，告知接下来要访问的行范围。
     * **endIndex 是 INCLUSIVE**——与 ChunkedAxis.getVisibleRange [first, last] 语义一致。
     * 同步源直接返回；异步源可返回 Promise，IO 完成后 emit `rowsChanged` 触发重绘。
     */
    getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>;
    /**
     * Paint 热点：CellPainter 对每个可见 cell 都调用，**必须同步 + 高吞吐**。
     * 异步源缓存未命中时返回 undefined——Renderer 绘空（M2+ 改绘占位骨架）。
     */
    getCell(rowIndex: number, fieldId: string): CellValue | undefined;
    /** 订阅变更事件。返回取消订阅的函数。 */
    subscribe(listener: DataSourceListener): () => void;
}
//# sourceMappingURL=DataSource.d.ts.map