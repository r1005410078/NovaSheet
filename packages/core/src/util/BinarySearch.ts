/**
 * Returns the smallest index `i` in [0, length) such that arr[i] > target.
 * If no such index exists, returns `length`.
 * arr must be sorted ascending.
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
