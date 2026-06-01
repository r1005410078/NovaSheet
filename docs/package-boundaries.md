# NovaSheet Package Boundaries

| Package | Role |
| --- | --- |
| `@novasheet/core` | Kernel: data, layout, frame contracts, `SheetContext` |
| `@novasheet/web` | Browser host/runtime primitives |
| `@novasheet/canvas2d` | Canvas2D renderer |
| `@novasheet/sheet` | Default assembled spreadsheet product |

Default users import:

```ts
import { Grid } from '@novasheet/sheet'
```

Advanced users can create a shared context:

```ts
const ctx = createSheetContext()
installRatingCell(ctx)
new Grid(el, { data, context: ctx })
```
