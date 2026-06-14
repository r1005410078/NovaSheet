import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { RichTextEditingSession } from './editingSession'

export interface RichTextToolbarController {
  getSession(): RichTextEditingSession | null
  setSession(session: RichTextEditingSession | null): void
  subscribe(listener: () => void): () => void
}

function createController(): RichTextToolbarController {
  let session: RichTextEditingSession | null = null
  const listeners = new Set<() => void>()
  return {
    getSession: () => session,
    setSession: (next) => {
      session = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const RichTextToolbarContext = createContext<RichTextToolbarController | null>(null)

export function RichTextToolbarProvider({
  children,
}: {
  readonly children: ReactNode
}): JSX.Element {
  const controller = useMemo(() => createController(), [])
  return (
    <RichTextToolbarContext.Provider value={controller}>
      {children}
    </RichTextToolbarContext.Provider>
  )
}

export function useRichTextToolbarController(): RichTextToolbarController {
  const controller = useContext(RichTextToolbarContext)
  if (!controller) throw new Error('RichTextToolbarProvider is required')
  return controller
}

export function useRichTextSession(): RichTextEditingSession | null {
  const controller = useRichTextToolbarController()
  return useSyncExternalStore(controller.subscribe, controller.getSession, controller.getSession)
}
