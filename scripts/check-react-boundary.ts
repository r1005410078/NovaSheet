/// <reference types="node" />
import { runReactBoundaryCheck } from '../packages/react/scripts/check-react-boundary'

if ((import.meta as { main?: boolean }).main) {
  process.exit(runReactBoundaryCheck())
}
