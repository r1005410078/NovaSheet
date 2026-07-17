// @ts-nocheck
import { SparseExcelDataSource } from '@zhiguang/core'
import { NovaExcel } from '@zhiguang/react'
import React from 'react'

const data = new SparseExcelDataSource()
data.updateCell(0, 'A', 'NovaSheet')
data.updateCell(1, 'A', 'Excel workspace')
data.updateCell(2, 'B', 'A-Z x 1000')
data.updateCell(999, 'A', 'edge content')

export function Sheet() {
  return React.createElement(NovaExcel, {
    data,
    className: 'h-[560px] w-full',
    // excelWorkspace: true — default; scroll past row 1000 at edge content to auto-grow
    onToolbarAction: (action) => {
      console.log('toolbar', action.id)
    },
  })
}
