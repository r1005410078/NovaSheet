/** Invoke user callback then run after-hook (toolbar sync). */
export function composeGridCallback<T extends (...args: never[]) => void>(
  user: T | undefined,
  after: () => void,
): T {
  return ((...args: Parameters<T>) => {
    user?.(...args)
    after()
  }) as T
}
