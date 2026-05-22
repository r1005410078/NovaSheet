import type { DataSource } from '../data/DataSource'

export function resolveUnderlyingRow(source: DataSource, viewRow: number): number {
  return source.resolveUnderlyingRow?.(viewRow) ?? viewRow
}

export function findViewRow(source: DataSource, underlyingRow: number): number {
  return source.findViewRow?.(underlyingRow) ?? underlyingRow
}
