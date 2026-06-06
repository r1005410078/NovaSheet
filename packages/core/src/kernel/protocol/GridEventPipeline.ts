import type { GridDomainEvent } from './GridDomainEvent'

/** Engine 内部同步事件处理器；不允许 handler 再 dispatch 新事件。 */
export interface GridDomainEventHandler {
  handle(event: GridDomainEvent): void
}

/** 固定顺序的 engine 内部事件管线；不是全局 event bus。 */
export class GridEventPipeline {
  constructor(private readonly handlers: readonly GridDomainEventHandler[]) {}

  dispatch(event: GridDomainEvent): void {
    for (const handler of this.handlers) {
      handler.handle(event)
    }
  }
}

