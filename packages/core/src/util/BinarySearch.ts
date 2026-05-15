/**
 * 返回升序数组 arr 中第一个严格大于 target 的元素下标（上界）。
 * 搜索范围为 [0, length)；若所有元素均不大于 target，返回 length。
 */
export function upperBound(arr: ArrayLike<number>, length: number, target: number): number {
  let lo = 0
  let hi = length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]! > target) hi = mid
    else lo = mid + 1
  }
  return lo
}
