/// <reference types="node" />
import { join } from 'node:path'
import { runCellKitBoundaryCheck } from '../packages/cell-kit/scripts/check-cellkit-boundary'

if ((import.meta as { main?: boolean }).main) {
  process.exit(runCellKitBoundaryCheck(join(import.meta.dirname, '..')))
}
