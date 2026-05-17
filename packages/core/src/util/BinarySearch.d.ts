/**
 * 在升序数组里二分，返回 [0, length) 中第一个使 `arr[i] > target` 的下标 i。
 * 不存在时返回 `length`。
 *
 * 用途：ChunkedAxis.positionToIndex 用 `upperBound - 1` 定位到 prefixSum <= position
 * 的 chunk。比 lowerBound 语义更适合「找该位置所在的区间」类问题，避免边界处理。
 *
 * 接收 (arr, length) 而非纯 arr 是为了支持 Float64Array 的部分长度——
 * chunkPrefixSum 的实际有效长度比数组分配长度可能短。
 */
export declare function upperBound(arr: ArrayLike<number>, length: number, target: number): number;
//# sourceMappingURL=BinarySearch.d.ts.map