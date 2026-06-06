/** 将网格线坐标对齐到 0.5px，并限制在 [start, end] 内。 */
export function snapLineInside(raw: number, start: number, end: number): number | undefined {
  if (raw < start || raw > end) return undefined
  if (raw === end) return Math.ceil(raw) - 0.5
  return Math.floor(raw) + 0.5
}
