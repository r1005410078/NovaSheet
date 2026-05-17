/**
 * `denseGridTheme`——M1 唯一内置主题，紧凑网格风（Linear / Excel 系）。
 *
 * 数值与色板对应 spec §1「视觉风格 A」选项：行高 28px、字号 12px、浅灰单元格分隔线、
 * 信息密度高。所有度量值都通过 Theme token 暴露，渲染层不允许出现硬编码（CLAUDE.md 不变量 #3）。
 *
 * 7 种 FieldType 各带一个 16×16 SVG icon（path-only）；M1 的 HeaderPainter 只画字段名，
 * icon 数据先备齐，M2/M3 在 Header 增加图标渲染时直接消费。
 *
 * 想做新主题：再写一份同样形状的 `Theme` 对象（airtableTheme / notionTheme 等），
 * 通过 `grid.setTheme(...)` 切换；切换后 Renderer 会清掉 measureText 缓存并整片重绘。
 */
import type { Theme } from './Theme';
export declare const denseGridTheme: Theme;
//# sourceMappingURL=denseGridTheme.d.ts.map