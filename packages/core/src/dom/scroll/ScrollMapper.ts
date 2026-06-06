/**
 * ScrollMapper——把原生 scrollTop 映射成逻辑滚动偏移 logicalY（spec §6.2）。
 *
 * 为什么需要：1M 行 × 28px = 28M px 内容高度，超过 Firefox（~17.9M）/ iOS Safari（~16.7M）
 * 元素最大可滚动高度上限。我们把 spacer 高度封顶在 SAFE_MAX = 6,000,000 px（所有目标浏览器
 * 都安全），原生滚动条仍可拖；scrollTop 通过本类映射到真实 logicalY 给 Viewport 用。
 *
 * 精度损失：当 content > spacer 时，拇指拖 1px ≈ ratio = content/spacer ≈ 4.67 行（28M/6M），
 * 对滚轮 / 触控板 0 损失；仅在「精确拖拽滚动条到某一行」这种极少数交互下感知（spec §6.7）。
 *
 * 用法：水平、垂直两轴各调用一次。Grid 在 setData / setRowHeight / setColumnWidth /
 * resize / setTheme 等改变内容/视口尺寸的时机重算 spacer。
 */

/** 6M px — Firefox/iOS Safari 元素最大滚动高度下限的最低公约数（spec §6.2） */
export const SAFE_MAX = 6_000_000

export class ScrollMapper {
  /**
   * 给定 axis 总内容尺寸（rowsAxis.getTotalSize() 等），返回 spacer 元素应使用的尺寸。
   * 小于 SAFE_MAX 时直通；否则封顶。
   */
  computeSpacerSize(contentSize: number): number {
    if (contentSize <= 0) return 0
    return Math.min(contentSize, SAFE_MAX)
  }

  /**
   * scrollTop ∈ [0, spacerSize - viewportSize]  →  logicalY ∈ [0, contentSize - viewportSize]
   *
   * - content ≤ spacer：直通（仍 clamp 边界）
   * - content > spacer：按比例放大
   * - 维度退化（viewport >= spacer 或 viewport >= content）：返回 0
   */
  scrollToLogical(
    scrollTop: number,
    spacerSize: number,
    contentSize: number,
    viewportSize: number,
  ): number {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxScroll <= 0 || maxLogical <= 0) return 0
    const clamped = Math.max(0, Math.min(maxScroll, scrollTop))
    if (contentSize <= spacerSize) return clamped // identity branch
    return (clamped / maxScroll) * maxLogical
  }

  /**
   * 反向：logicalY → scrollTop，用于程序化滚动（scrollToRow / scrollToCell）。
   */
  logicalToScroll(
    logicalY: number,
    spacerSize: number,
    contentSize: number,
    viewportSize: number,
  ): number {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxScroll <= 0 || maxLogical <= 0) return 0
    const clamped = Math.max(0, Math.min(maxLogical, logicalY))
    return (clamped / maxLogical) * maxScroll
  }
}
