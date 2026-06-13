# @novasheet/cell-kit

第一方 opt-in 单元格组件（首个：rich-text）。默认**不进** `@novasheet/core`/`@novasheet/react`——和外部第三方扩展走同一注册路径。

## 装配（display 半）

```ts
import { richTextExtension } from '@novasheet/cell-kit'
import { canvas2dBackend } from '@novasheet/canvas2d'

new Grid(container, {
  data,
  cellAttachments: [richTextExtension.codec],
  backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
})
```

编辑器 / 浮动工具栏见 Phase C-edit。
