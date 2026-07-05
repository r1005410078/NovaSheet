import type {
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from '../../../../src/ports/WindowedDataProvider'
import type { DataWindow } from '../../../../src/kernel/data/DataSource'

export interface PendingLoad {
  readonly window: DataWindow
  readonly signal: AbortSignal
  resolve(slice: RangeSlice): void
  reject(error: unknown): void
}

export interface FakeWindowedProvider {
  readonly provider: WindowedDataProvider
  /** 尚未 resolve/reject 的请求，按发起顺序排列。 */
  pendingLoads(): PendingLoad[]
  /** 便捷方法：resolve 第一个匹配给定窗口的 pending 请求。 */
  resolveFirstMatching(window: DataWindow, slice: RangeSlice): void
  /** 模拟 subscribe 通道推送一个事件。 */
  emit(event: WindowedDataEvent): void
  /** setWindow 调用记录。 */
  readonly setWindowCalls: DataWindow[]
  /** subscription.close() 调用次数。 */
  readonly closeCalls: number
  /** 若非 null，构造期 subscribe() 直接抛出这个错误（测试降级路径）。 */
  subscribeThrows: unknown
}

export function createFakeWindowedProvider(): FakeWindowedProvider {
  const pending: PendingLoad[] = []
  const setWindowCalls: DataWindow[] = []
  let closeCalls = 0
  let onEvent: ((event: WindowedDataEvent) => void) | null = null

  const state: FakeWindowedProvider = {
    provider: {
      loadRange(window, signal) {
        return new Promise<RangeSlice>((resolve, reject) => {
          const entry: PendingLoad = {
            window,
            signal,
            resolve: (slice) => {
              const i = pending.indexOf(entry)
              if (i >= 0) pending.splice(i, 1)
              resolve(slice)
            },
            reject: (error) => {
              const i = pending.indexOf(entry)
              if (i >= 0) pending.splice(i, 1)
              reject(error)
            },
          }
          pending.push(entry)
        })
      },
      subscribe(handler) {
        if (state.subscribeThrows) throw state.subscribeThrows
        onEvent = handler
        const subscription: WindowSubscription = {
          setWindow: (window) => setWindowCalls.push(window),
          close: () => {
            closeCalls += 1
          },
        }
        return subscription
      },
    },
    pendingLoads: () => [...pending],
    resolveFirstMatching: (window, slice) => {
      const match = pending.find(
        (p) =>
          p.window.startRow === window.startRow &&
          p.window.endRow === window.endRow &&
          p.window.startCol === window.startCol &&
          p.window.endCol === window.endCol,
      )
      if (!match) throw new Error(`no pending load matches window ${JSON.stringify(window)}`)
      match.resolve(slice)
    },
    emit: (event) => onEvent?.(event),
    setWindowCalls,
    subscribeThrows: null,
    get closeCalls() {
      return closeCalls
    },
  }
  return state
}
