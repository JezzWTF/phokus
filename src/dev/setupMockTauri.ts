import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { handleMockCommand } from "./mockBackend";

mockWindows("main");
mockConvertFileSrc("windows");

mockIPC((cmd, payload) => handleMockCommand(cmd, payload), {
  shouldMockEvents: true,
});

console.info("[Phokus UI Lab] Mock Tauri backend installed.");
