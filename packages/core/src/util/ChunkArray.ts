export interface Chunk {
  /** Actual number of rows in this chunk (== CHUNK_SIZE for all but the last chunk) */
  length: number
  totalSize: number
  sizes: Float32Array | null
}

export function createDefaultChunk(chunkRowCount: number, defaultSize: number): Chunk {
  return {
    length: chunkRowCount,
    totalSize: chunkRowCount * defaultSize,
    sizes: null,
  }
}
