/** Cell capability registered by a sheet extension. */
export interface CellExtension {
  draw?: () => void
  edit?: () => void
  text?: () => string
  parse?: (text: string) => unknown
}

/** Command handler registered by a sheet extension. */
export type CommandHandler = () => void | boolean | Promise<void | boolean>

/** Opaque extension contribution registered under a named contribution point. */
export type ExtensionContribution = unknown

/** Registered extension capabilities for one SheetContext. */
export interface ExtensionRegistry {
  readonly cells: Map<string, CellExtension>
  readonly commands: Map<string, CommandHandler>
  readonly contributions: Map<string, ExtensionContribution[]>
}

/** Registration API exposed to extension installers. */
export interface ExtensionRegistrar {
  cell(type: string, extension: CellExtension): void
  command(id: string, handler: CommandHandler): void
  contribute(point: string, contribution: ExtensionContribution): void
}
