import { InMemoryDataSource, denseGridTheme, type Theme } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const compactTheme: Theme = {
  ...denseGridTheme,
  metrics: { ...denseGridTheme.metrics, rowHeight: 24, headerHeight: 28, fontSize: 11 },
  colors: { ...denseGridTheme.colors, background: '#fbfbfd' },
}

createGridHost({ data, theme: compactTheme })
