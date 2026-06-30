#!/usr/bin/env bash
set -Eeuo pipefail

# Codex Cloud setup for Phokus.
# Paste this script into the Codex Cloud environment setup field, or run it from
# the repo root with: bash scripts/codex-cloud-setup.sh
#
# Goals:
# - install Linux packages needed by Tauri/WebKit and native Rust crates
# - install JS dependencies with pnpm using the lockfile
# - pre-fetch Rust dependencies while setup still has internet access
# - keep the environment CPU-safe by avoiding Phokus' default CUDA feature set
# - leave Codex with clear verification commands for UI and Rust work

log() {
  printf '\n\033[1;36m[phokus-codex]\033[0m %s\n' "$*"
}

warn() {
  printf '\n\033[1;33m[phokus-codex warning]\033[0m %s\n' "$*" >&2
}

repo_root="$(pwd)"

if [[ ! -f "package.json" || ! -d "src-tauri" ]]; then
  warn "This script should be run from the Phokus repository root. Current directory: ${repo_root}"
  exit 1
fi

export CI=1
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PNPM_VERSION="${PNPM_VERSION:-10.20.0}"
export PATH="$PNPM_HOME:$HOME/.cargo/bin:$PATH"

# Persist useful shell defaults for the later Codex agent phase. Codex setup runs
# in a separate Bash session, so exports here alone would not survive.
if ! grep -q "# Phokus Codex Cloud" "$HOME/.bashrc" 2>/dev/null; then
  cat >> "$HOME/.bashrc" <<'BASHRC'

# Phokus Codex Cloud
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PNPM_VERSION="${PNPM_VERSION:-10.20.0}"
export PATH="$PNPM_HOME:$HOME/.cargo/bin:$PATH"
export CI=1
BASHRC
fi

install_apt_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "apt-get not found; skipping system package installation."
    return 0
  fi

  local -a apt_cmd=(apt-get)
  if [[ "$(id -u)" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      apt_cmd=(sudo apt-get)
    else
      warn "apt-get is available but sudo is not. Re-run as root or add sudo to the image."
      return 1
    fi
  fi

  log "Installing Linux system dependencies for Tauri, WebKit, SQLite/native crates, and browser tooling"

  "${apt_cmd[@]}" update

  # Tauri v2 / wry needs the WebKitGTK 4.1 libsoup3 development package. Do not
  # fall back to libwebkit2gtk-4.0-dev: that is the libsoup2 variant and will
  # still fail later during cargo check for the current dependency stack.
  if ! apt-cache show libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
    warn "libwebkit2gtk-4.1-dev is unavailable in this apt source. Use a newer Ubuntu/Debian image or add a repository that provides WebKitGTK 4.1/libsoup3 development packages."
    return 1
  fi

  local common_packages=(
    build-essential
    curl
    wget
    file
    pkg-config
    libssl-dev
    libgtk-3-dev
    libayatana-appindicator3-dev
    librsvg2-dev
    patchelf
    ca-certificates
    libwebkit2gtk-4.1-dev
  )

  "${apt_cmd[@]}" install -y --no-install-recommends "${common_packages[@]}"
}

ensure_node_and_pnpm() {
  log "Preparing Node/pnpm"

  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js is not available in this image. Pin Node.js 20.19+ or 22.12+ in the Codex environment settings, or use a Codex universal image with Node installed."
    exit 1
  fi

  if ! node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); const ok = (major === 20 && (minor > 19 || (minor === 19 && patch >= 0))) || major > 22 || (major === 22 && (minor > 12 || (minor === 12 && patch >= 0))); process.exit(ok ? 0 : 1);'; then
    warn "Phokus' locked Vite version expects Node.js ^20.19.0 or >=22.12.0. Current version: $(node --version). Pin a compatible Node version in Codex environment settings."
    exit 1
  fi

  mkdir -p "$PNPM_HOME"

  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g "pnpm@${PNPM_VERSION}"
  fi

  log "Node: $(node --version)"
  log "pnpm: $(pnpm --version)"
}

rustup_target_triple() {
  case "$(uname -m)" in
    x86_64 | amd64) printf 'x86_64-unknown-linux-gnu' ;;
    aarch64 | arm64) printf 'aarch64-unknown-linux-gnu' ;;
    *)
      warn "Unsupported architecture for automatic rustup-init install: $(uname -m)"
      return 1
      ;;
  esac
}

install_rustup_init() {
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is required to install rustup but was not found."
    return 1
  fi

  local target_triple
  target_triple="$(rustup_target_triple)"

  local rustup_url="https://static.rust-lang.org/rustup/dist/${target_triple}/rustup-init"
  local rustup_sha_url="${rustup_url}.sha256"
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  curl --proto '=https' --tlsv1.2 -fsSL "$rustup_url" -o "$tmp_dir/rustup-init"
  curl --proto '=https' --tlsv1.2 -fsSL "$rustup_sha_url" -o "$tmp_dir/rustup-init.sha256"

  (
    cd "$tmp_dir"
    sha256sum --check rustup-init.sha256
    chmod +x rustup-init
    ./rustup-init -y --profile minimal --no-modify-path
  )

  rm -rf "$tmp_dir"
}

ensure_rust() {
  log "Preparing Rust toolchain"

  if ! command -v rustup >/dev/null 2>&1; then
    install_rustup_init
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
  fi

  rustup toolchain install stable --profile minimal
  rustup default stable
  rustup component add rustfmt clippy

  log "rustc: $(rustc --version)"
  log "cargo: $(cargo --version)"
}

install_js_dependencies() {
  log "Installing frontend dependencies"
  pnpm install --frozen-lockfile
}

prefetch_rust_dependencies() {
  log "Pre-fetching Rust dependencies for CPU-safe Tauri checks"

  # Phokus enables candle-cuda by default in Cargo.toml. Codex Cloud usually runs
  # in a CPU Linux container, so use --no-default-features for checks/builds
  # unless you intentionally configure a CUDA-capable environment.
  cargo fetch --manifest-path src-tauri/Cargo.toml --locked

  # This is intentionally a check, not a full release build. It warms the Cargo
  # cache and catches missing native packages without making setup painfully slow.
  cargo check --manifest-path src-tauri/Cargo.toml --locked --no-default-features
}

install_playwright_browsers() {
  log "Installing Playwright Chromium dependencies for UI Lab/browser screenshots"

  # Safe even if no Playwright tests are present yet. Useful for Codex browser
  # inspection against `pnpm dev:ui`.
  pnpm exec playwright install --with-deps chromium || warn "Playwright browser install failed; UI work may still run, but browser automation/screenshots may need manual setup."
}

print_next_steps() {
  cat <<'EOF'

[phokus-codex] Setup complete.

Recommended Codex verification commands:
  pnpm exec tsc --noEmit
  pnpm build:vite
  cargo check --manifest-path src-tauri/Cargo.toml --locked --no-default-features

For visual UI work in Codex/browser environments:
  pnpm dev:ui
  Visit: http://127.0.0.1:1422/?scenario=rich

Other useful UI Lab scenarios:
  http://127.0.0.1:1422/?scenario=empty
  http://127.0.0.1:1422/?scenario=duplicates
  http://127.0.0.1:1422/?scenario=errors
  http://127.0.0.1:1422/?scenario=huge

Avoid these in standard CPU-only Codex Cloud unless you have configured CUDA:
  pnpm dev:app
  pnpm build:app:cuda
  cargo check --manifest-path src-tauri/Cargo.toml
EOF
}

main() {
  install_apt_packages
  ensure_node_and_pnpm
  ensure_rust
  install_js_dependencies
  prefetch_rust_dependencies
  install_playwright_browsers
  print_next_steps
}

main "$@"
