import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { handleMockCommand } from './mockBackend'

mockWindows('main')
mockConvertFileSrc('windows')

mockIPC(
  async (cmd, payload) => {
    const result = await handleMockCommand(cmd, payload)
    // Real invoke() deserializes fresh JSON on every call, so callers never
    // share references into backend state and Zustand identity checks see
    // every change. Clone here so the mock behaves the same — returning
    // `db.albums` directly froze the sidebar because set({ albums }) kept
    // the same array identity across loads.
    return structuredClone(result)
  },
  {
    shouldMockEvents: true,
  }
)

console.info('[Phokus UI Lab] Mock Tauri backend installed.')
