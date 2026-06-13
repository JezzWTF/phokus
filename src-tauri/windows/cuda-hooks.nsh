; NSIS hooks for the CUDA build variant.
;
; The CUDA exe load-time-imports the CUDA runtime DLLs, so they must sit next
; to phokus.exe ($INSTDIR) where the Windows loader searches. Rather than
; bundling them as Tauri "resources" (which land in $INSTDIR\resources\) and
; then relocating them — a move that proved unreliable in the elevated/silent
; installer (CopyFiles via SHFileOperation, and even Rename, failed) — we embed
; them directly into the installer with NSIS `File` and extract them straight
; to $INSTDIR. `File` is the standard, reliable install primitive.
;
; This hook is !included from its original location, and ${__FILEDIR__} in this
; top-level !define expands at *include* time to this file's own directory,
; src-tauri\windows. cuda-redist is its sibling under src-tauri, so one level
; up. (Caveat that bit us: ${__FILEDIR__} used inline *inside the macro* would
; instead expand at insertion time to Tauri's generated nsis dir — hence the
; !define here.) The 4 DLLs must be present in src-tauri\cuda-redist at build
; time (see RELEASE_PLAN.md).

!define CUDA_REDIST "${__FILEDIR__}\..\cuda-redist"

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Phokus: installing bundled CUDA runtime libraries..."
  SetOutPath "$INSTDIR"
  File "${CUDA_REDIST}\cudart64_12.dll"
  File "${CUDA_REDIST}\cublas64_12.dll"
  File "${CUDA_REDIST}\cublasLt64_12.dll"
  File "${CUDA_REDIST}\curand64_10.dll"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\cudart64_12.dll"
  Delete "$INSTDIR\cublas64_12.dll"
  Delete "$INSTDIR\cublasLt64_12.dll"
  Delete "$INSTDIR\curand64_10.dll"
!macroend
