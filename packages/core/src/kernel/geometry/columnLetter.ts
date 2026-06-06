/** 0-based 列索引 → Excel 列标（A, B, …, Z, AA, …）。 */
export function columnIndexToLetter(index: number): string {
  if (index < 0 || !Number.isFinite(index)) return ''
  let n = Math.floor(index)
  let result = ''
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}
