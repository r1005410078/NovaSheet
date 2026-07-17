/**
 * @zhiguang/react test bootstrap.
 * core setup (happy-dom) runs first via bunfig preload chain.
 */

// React 18: mark bun + happy-dom as a testing environment so act() from helpers is honored.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
