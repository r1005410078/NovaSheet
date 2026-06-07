import { SparseExcelDataSource, withExcelHeaders } from '@novasheet/core'
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
