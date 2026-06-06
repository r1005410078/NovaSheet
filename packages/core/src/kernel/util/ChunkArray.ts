/**
 * ChunkedAxis 的最小存储单元。
 * 见 geometry/ChunkedAxis.ts 顶部模块注释了解整体设计与不变量。
 */
export interface Chunk {
  /**
   * 该 chunk 内的实际项数。除最后一个 partial chunk 外都等于 CHUNK_SIZE。
   * **遍历 sizes 时必须用 length，不能用 sizes.length**——后者恒为 CHUNK_SIZE，
   * 会把末尾零填充也算进去。
   */
  length: number
  /** 该 chunk 内所有项尺寸之和 */
  totalSize: number
  /**
   * 逐项尺寸数组。null 表示「全 chunk 还是默认尺寸」（O(1) 内存基线）；
   * 一旦有任何一项偏离 defaultSize 就懒分配 Float32Array。
   * 物化数组容量 = chunk.length（变长，insert/delete 后可能变化）；
   * 遍历时必须用 chunk.length，不能用 sizes.length。
   */
  sizes: Float32Array | null
}

/**
 * 构造一个「全默认」chunk：sizes 为 null，totalSize 由项数 × 默认尺寸算得。
 * ChunkedAxis.rebuild 用它批量初始化。
 */
export function createDefaultChunk(chunkRowCount: number, defaultSize: number): Chunk {
  return {
    length: chunkRowCount,
    totalSize: chunkRowCount * defaultSize,
    sizes: null,
  }
}
