// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { InMemoryDataSource } from '@novasheet/core'
import { wrapAutofitSampleRows, wrapAutofitSchema } from '../mock-data'
import { createGridHost } from '../grid-host'

createGridHost(
  {
    data: new InMemoryDataSource({
      schema: wrapAutofitSchema(),
      rows: wrapAutofitSampleRows(),
    }),
  },
  720,
  420,
)
