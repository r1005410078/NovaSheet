/// <reference types="node" />
import { runKernelBoundaryCheck } from '../packages/core/scripts/check-kernel-boundary'

if ((import.meta as any).main) {
  process.exit(runKernelBoundaryCheck())
}
