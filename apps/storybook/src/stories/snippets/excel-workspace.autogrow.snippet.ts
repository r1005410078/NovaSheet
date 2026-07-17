// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { SparseExcelDataSource, withExcelHeaders } from '@zhiguang/core'
import { createGridHost } from '../grid-host'

const data = new SparseExcelDataSource()
data.updateCell(0, 'A', 'NovaSheet')
data.updateCell(1, 'A', 'Excel workspace')
data.updateCell(999, 'A', 'edge content')

createGridHost(
  withExcelHeaders({
    data,
    excelWorkspace: true,
  }),
)
