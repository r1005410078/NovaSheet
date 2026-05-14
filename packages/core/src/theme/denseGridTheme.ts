import type { Theme } from './Theme'

const simpleIcon = (path: string) => ({ path }) as const

export const denseGridTheme: Theme = {
  metrics: {
    rowHeight: 28,
    headerHeight: 32,
    cellPaddingX: 8,
    cellPaddingY: 4,
    fontSize: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderWidth: 1,
  },
  colors: {
    background: '#ffffff',
    headerBackground: '#f6f8fa',
    text: '#1f2328',
    headerText: '#656d76',
    gridLine: '#eaeef2',
    gridLineStrong: '#d0d7de',
    frozenShadow: 'rgba(0,0,0,0.08)',
    hoverRowBg: '#f6f8fa',
    selectionBg: 'rgba(9,105,218,0.10)',
    selectionBorder: '#0969da',
  },
  cell: {
    textAlignByType: {
      text: 'left',
      number: 'right',
      singleSelect: 'left',
      multiSelect: 'left',
      date: 'left',
      checkbox: 'left',
      url: 'left',
    },
    tagRadius: 10,
    tagPaddingX: 6,
  },
  icons: {
    byFieldType: {
      text: simpleIcon('M3 4h10v1.5H3zM3 8h10v1.5H3zM3 12h7v1.5H3z'),
      number: simpleIcon('M5 3l-.5 3h2L7 3h1.5L8 6h2v1.5H7.75l-.25 2H10V11H7.25L6.75 14h-1.5l.5-3h-2L3.25 14h-1.5l.5-3H0V9.5h2.5l.25-2H0V6h3l.5-3z'),
      singleSelect: simpleIcon('M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5A5.5 5.5 0 118 2.5a5.5 5.5 0 010 11zM8 4.5A3.5 3.5 0 118 11.5 3.5 3.5 0 018 4.5z'),
      multiSelect: simpleIcon('M2 3h12v2H2zM2 7h12v2H2zM2 11h8v2H2z'),
      date: simpleIcon('M4 1v1.5H3A1.5 1.5 0 001.5 4v9A1.5 1.5 0 003 14.5h10A1.5 1.5 0 0014.5 13V4A1.5 1.5 0 0013 2.5h-1V1h-1.5v1.5h-5V1H4zm-1 5h10v7H3V6z'),
      checkbox: simpleIcon('M3 2.5A1.5 1.5 0 011.5 4v8A1.5 1.5 0 003 13.5h10A1.5 1.5 0 0014.5 12V4A1.5 1.5 0 0013 2.5H3zm4.25 7.31l4.94-4.94L11.13 3.81 7.25 7.69 5.81 6.25 4.75 7.31l2.5 2.5z'),
      url: simpleIcon('M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12a6 6 0 01-6 6V2a6 6 0 016 6H2z'),
    },
  },
  scrollbar: {
    trackWidth: 12,
    thumbColor: 'rgba(0,0,0,0.3)',
  },
}
