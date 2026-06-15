import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { imagetools } from "vite-imagetools";

// Static product site for phokus.jezz.wtf. Isolated from the Tauri renderer —
// no imports from ../src. Built and served by Ctrl on the Oracle VM.
// Screenshots are imported with ?as=picture and transcoded to AVIF/WebP at build.
export default defineConfig({
  plugins: [react(), tailwindcss(), imagetools({ removeMetadata: true })],
});
