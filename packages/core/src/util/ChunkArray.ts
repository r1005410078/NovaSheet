export interface Chunk {
  totalSize: number
  sizes: Float32Array | null
}

export function createDefaultChunk(chunkRowCount: number, defaultSize: number): Chunk {
  return {
    totalSize: chunkRowCount * defaultSize,
    sizes: null,
  }
}
