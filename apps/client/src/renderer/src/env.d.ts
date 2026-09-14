import type { RbBridge } from '../../shared/bridge.js'

declare global {
  interface Window {
    /** Exposed by the preload script. The renderer's only way out. */
    readonly rb: RbBridge
  }
}

export {}
