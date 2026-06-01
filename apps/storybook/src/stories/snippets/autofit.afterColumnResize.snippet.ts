// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
grid.autofitRows()
grid.setColumnWidth('desc', 100) // narrower column -> text should wrap into more lines
grid.autofitRows() // manually recalculate again
