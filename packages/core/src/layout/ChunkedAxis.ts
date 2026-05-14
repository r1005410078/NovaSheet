import { upperBound } from '../util/BinarySearch'
import { type Chunk, createDefaultChunk } from '../util/ChunkArray'

export const CHUNK_SIZE = 1024

export interface ChunkedAxisOptions {
  count: number
  defaultSize: number
}

export class ChunkedAxis {
  private defaultSize: number
  private count: number
  private chunks: Chunk[] = []
  /** chunkPrefixSum[i] = sum of totalSize for chunks[0..i). length = chunks.length + 1 */
  private chunkPrefixSum!: Float64Array
  private totalSize = 0
  private _version = 0

  constructor(opts: ChunkedAxisOptions) {
    this.defaultSize = opts.defaultSize
    this.count = opts.count
    this.rebuild()
  }

  get version(): number {
    return this._version
  }

  getTotalSize(): number {
    return this.totalSize
  }

  getCount(): number {
    return this.count
  }

  getChunkCount(): number {
    return this.chunks.length
  }

  getDefaultSize(): number {
    return this.defaultSize
  }

  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const chunkIdx = clamped >>> 10
    const offsetInChunk = clamped & 1023
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      return base + offsetInChunk * this.defaultSize
    }
    let sum = 0
    for (let i = 0; i < offsetInChunk; i++) sum += chunk.sizes[i]!
    return base + sum
  }

  positionToIndex(position: number): number {
    if (this.count === 0) return 0
    if (position <= 0) return 0
    if (position >= this.totalSize) return this.count - 1
    const chunkIdx = upperBound(this.chunkPrefixSum, this.chunks.length + 1, position) - 1
    const chunk = this.chunks[chunkIdx]!
    const yInChunk = position - this.chunkPrefixSum[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(CHUNK_SIZE - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + inner)
    }
    let acc = 0
    for (let i = 0; i < chunk.sizes.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) {
        return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + i)
      }
    }
    return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + chunk.sizes.length - 1)
  }

  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!

    if (chunk.sizes === null) {
      if (size === this.defaultSize) return
      const rowsInChunk =
        chunkIdx === this.chunks.length - 1
          ? this.count - chunkIdx * CHUNK_SIZE
          : CHUNK_SIZE
      const sizes = new Float32Array(CHUNK_SIZE)
      for (let i = 0; i < rowsInChunk; i++) sizes[i] = this.defaultSize
      chunk.sizes = sizes
    }

    const old = chunk.sizes[offsetInChunk]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offsetInChunk] = size
    chunk.totalSize += delta

    for (let i = chunkIdx + 1; i <= this.chunks.length; i++) {
      this.chunkPrefixSum[i] = this.chunkPrefixSum[i]! + delta
    }
    this.totalSize += delta
    this._version++
  }

  getVisibleRange(startPos: number, endPos: number): [number, number] {
    if (this.count === 0) return [0, -1]
    const first = this.positionToIndex(startPos)
    const last = this.positionToIndex(endPos)
    return [first, last]
  }

  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    // Recompute every chunk
    this.totalSize = 0
    this.chunkPrefixSum = new Float64Array(this.chunks.length + 1)
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.sizes === null) {
        const rowsInChunk =
          i === this.chunks.length - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
        chunk.totalSize = rowsInChunk * newDefault
      } else {
        // chunk has explicit per-row sizes: only those equal to oldDefault scale up
        let sum = 0
        for (let k = 0; k < chunk.sizes.length; k++) {
          if (chunk.sizes[k] === oldDefault) chunk.sizes[k] = newDefault
          sum += chunk.sizes[k]!
        }
        chunk.totalSize = sum
      }
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }

  private rebuild(): void {
    const nChunks = Math.ceil(this.count / CHUNK_SIZE)
    this.chunks = new Array(nChunks)
    this.chunkPrefixSum = new Float64Array(nChunks + 1)
    this.totalSize = 0
    for (let i = 0; i < nChunks; i++) {
      const rowsInChunk = i === nChunks - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
      const chunk = createDefaultChunk(rowsInChunk, this.defaultSize)
      this.chunks[i] = chunk
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }
}
