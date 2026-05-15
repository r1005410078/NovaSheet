/** 分块数据结构：存储单块内的行/列尺寸信息 */
export interface Chunk {
  /** 本块实际行/列数（末块可能 < CHUNK_SIZE，其余块均等于 CHUNK_SIZE） */
  length: number
  /** 本块所有行/列的像素尺寸之和 */
  totalSize: number
  /** 各行/列的显式尺寸数组；null 表示全部使用默认尺寸（零内存开销） */
  sizes: Float32Array | null
}

/** 创建一个所有行/列均使用默认尺寸的初始分块（sizes = null） */
export function createDefaultChunk(chunkRowCount: number, defaultSize: number): Chunk {
  return {
    length: chunkRowCount,
    totalSize: chunkRowCount * defaultSize,
    sizes: null,
  }
}
