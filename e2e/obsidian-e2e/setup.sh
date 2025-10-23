#!/usr/bin/env bash

# e2e-setup.sh
# This script prepares the Obsidian E2E testing environment by unpacking
# asar files included in the repository.

# Project Root Directory/
# ├── (Your Plugin Source Code)/   <-- (A)
# │   ├── manifest.json              <-- [REQUIRED] Specifies the plugin ID.
# │   └── package.json               <-- [REQUIRED] Specifies the build command.
# │
# └── e2e/                           <-- Folder for placing this script
#     ├── e2e-setup.sh               <-- The main script
#     ├── paths.json                 <-- [REQUIRED] Configuration file
#     └── assets/                    <-- (B) Obsidian resource/asset storage
#         └── app.asar               <-- [REQUIRED] The main Obsidian application file
#         └── obsidian.asar          <-- [REQUIRED] Obsidian core functionality
#         └── app.asar.unpacked.zip  <-- [REQUIRED] Additional files

set -e

# =============================================================================
# Color Constants
# =============================================================================
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_NC='\033[0m'

# =============================================================================
# Utility Functions
# =============================================================================

# Print colored log messages
log_info() {
    echo -e "${COLOR_CYAN}$1${COLOR_NC}"
}

log_success() {
    echo -e "${COLOR_GREEN}$1${COLOR_NC}"
}

log_warning() {
    echo -e "${COLOR_YELLOW}$1${COLOR_NC}"
}

log_error() {
    echo -e "${COLOR_RED}$1${COLOR_NC}" >&2
    exit 1
}

# Check if file exists and log result
check_file() {
    local file_path="$1"
    local file_name="$2"

    echo "${file_name}: ${file_path}"
    if [[ -f "$file_path" ]]; then
        echo "  ✓ File exists"
    else
        echo "  ✗ File does not exist"
    fi
}

# =============================================================================
# Validation Functions
# =============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v jq &> /dev/null; then
        log_error "Error: 'jq' is not installed. Please install it to proceed."
    fi

    if ! command -v pnpm &> /dev/null; then
        log_error "Error: 'pnpm' is not installed. Please make sure it is available in the environment."
    fi

    log_success "Prerequisites check passed."
}

validate_plugin_manifest() {
    local manifest_path="$1"

    log_info "Reading plugin info from ${manifest_path}..."

    if [[ ! -f "$manifest_path" ]]; then
        log_error "Error: Plugin manifest not found at '${manifest_path}'."
    fi

    local plugin_id
    plugin_id=$(jq -r '.id' "$manifest_path")

    if [[ -z "$plugin_id" || "$plugin_id" == "null" ]]; then
        log_error "Error: Could not read 'id' from '${manifest_path}'."
    fi

    echo "  - Plugin ID: ${plugin_id}"
    echo "$plugin_id"
}

# =============================================================================
# Core Functions
# =============================================================================

setup_paths() {
    readonly SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
    readonly PATHS_JSON="${SCRIPT_DIR}/paths.json"

    if [[ ! -f "$PATHS_JSON" ]]; then
        log_error "Error: Configuration file not found at '${PATHS_JSON}'."
    fi

    # Read values from JSON configuration
    readonly VAULT_NAME=$(jq -r '.vaultName' "$PATHS_JSON")
    readonly PLUGIN_SOURCE_DIR=$(jq -r '.pluginSourceDir' "$PATHS_JSON")
    readonly OBSIDIAN_UNPACKED_DIR=$(jq -r '.obsidianUnpackedDir' "$PATHS_JSON")
    readonly E2E_ASSETS_DIR=$(jq -r '.e2eAssetsDir' "$PATHS_JSON")
    readonly DIST_DIR_NAME=$(jq -r '.distDir' "$PATHS_JSON")
    readonly APP_MAIN_FILE=$(jq -r '.appMainFile' "$PATHS_JSON")

    # Construct full paths based on the loaded configuration
    readonly PLUGIN_SOURCE_FULL_PATH=$(realpath "${SCRIPT_DIR}/${PLUGIN_SOURCE_DIR}")
    readonly PLUGIN_MANIFEST_PATH="${PLUGIN_SOURCE_FULL_PATH}/manifest.json"
    readonly OBSIDIAN_UNPACKED_PATH="${SCRIPT_DIR}/${OBSIDIAN_UNPACKED_DIR}"
    readonly APP_ASAR_PATH="${SCRIPT_DIR}/${E2E_ASSETS_DIR}/app.asar"
    readonly OBSIDIAN_ASAR_PATH="${SCRIPT_DIR}/${E2E_ASSETS_DIR}/obsidian.asar"
    readonly VAULT_PATH="${SCRIPT_DIR}/${VAULT_NAME}"
	readonly APP_ASAR_UNPACKED_ZIP_PATH="${SCRIPT_DIR}/${E2E_ASSETS_DIR}/app.asar.unpacked.zip"
	readonly APP_ASAR_UNPACKED_DIR_PATH="${SCRIPT_DIR}/${E2E_ASSETS_DIR}/app.asar.unpacked"
}

unpack_obsidian_assets() {
    log_success "\nUnpacking Obsidian ASAR archives from ${E2E_ASSETS_DIR}/..."

    # Debug: Check file existence
    check_file "$OBSIDIAN_UNPACKED_PATH" "OBSIDIAN_UNPACKED_PATH"
    check_file "$APP_ASAR_PATH" "APP_ASAR_PATH"
    check_file "$OBSIDIAN_ASAR_PATH" "OBSIDIAN_ASAR_PATH"

    # Validate required files
    if [[ ! -f "$APP_ASAR_PATH" ]]; then
        log_error "Error: app.asar not found at '${APP_ASAR_PATH}'. Make sure the file is present in the repository."
    fi

    # Clean up and create directory
    log_info "Cleaning up previous unpack directory..."
    rm -rf "$OBSIDIAN_UNPACKED_PATH"
    mkdir -p "$OBSIDIAN_UNPACKED_PATH"

	# Unzip app.asar.unpacked.zip if it exists
	if [[ -f "$APP_ASAR_UNPACKED_ZIP_PATH" ]]; then
		log_info "Unzipping ${APP_ASAR_UNPACKED_ZIP_PATH}..."
		# Clean up previous directory if it exists
		rm -rf "$APP_ASAR_UNPACKED_DIR_PATH"
		# Unzip to e2e/assets/app.asar.unpacked
		unzip -q "$APP_ASAR_UNPACKED_ZIP_PATH" -d "$(dirname "$APP_ASAR_UNPACKED_ZIP_PATH")"
		log_success "Unzip completed."
	else
		log_warning "Warning: ${APP_ASAR_UNPACKED_ZIP_PATH} not found. Skipping unzip."
	fi

    # Extract app.asar
    log_info "Extracting ${APP_ASAR_PATH} to ${OBSIDIAN_UNPACKED_PATH}"
    pnpm exec asar extract "${APP_ASAR_PATH}" "${OBSIDIAN_UNPACKED_PATH}"

    # Rename main.js to main.cjs to treat it as a CommonJS module
    local main_js_path="${OBSIDIAN_UNPACKED_PATH}/main.js"
    local main_cjs_path="${OBSIDIAN_UNPACKED_PATH}/${APP_MAIN_FILE}"
    if [[ -f "$main_js_path" ]]; then
        log_info "Renaming main.js to ${APP_MAIN_FILE}..."
        mv "$main_js_path" "$main_cjs_path"
        log_success "Renaming completed."
    else
        log_warning "Warning: main.js not found after extraction. Skipping rename."
    fi

    # Copy obsidian.asar if it exists
    if [[ -f "$OBSIDIAN_ASAR_PATH" ]]; then
        log_info "Copying ${OBSIDIAN_ASAR_PATH} to ${OBSIDIAN_UNPACKED_PATH}/"
        cp "$OBSIDIAN_ASAR_PATH" "$OBSIDIAN_UNPACKED_PATH/"
    else
        log_warning "Warning: obsidian.asar not found at '${OBSIDIAN_ASAR_PATH}'. Skipping."
    fi

    log_success "Asset unpacking completed."
}

create_vault() {
    log_info "Setting up test vault..."

    if [[ ! -d "$VAULT_PATH" ]]; then
        log_info "Creating test vault directory: $VAULT_PATH"
        mkdir -p "$VAULT_PATH"
    else
        log_info "Test vault directory already exists: $VAULT_PATH"
    fi
}

build_plugin() {
    log_success "\nBuilding plugin for E2E tests..."

    if ! (cd "$PLUGIN_SOURCE_FULL_PATH" && pnpm build); then
        log_error "Failed to build plugin."
    fi

    log_success "Plugin build completed."
}

link_plugin() {
    local plugin_id="$1"
    local plugin_build_dir="${PLUGIN_SOURCE_FULL_PATH}/${DIST_DIR_NAME}"
    local plugin_link_path="${VAULT_PATH}/.obsidian/plugins/${plugin_id}"

    log_success "\nLinking built plugin to ${plugin_link_path}..."

    mkdir -p "$(dirname "$plugin_link_path")"

    if [[ "$OS" == "Windows_NT" ]]; then
		cmd <<< "mklink /D $(cygpath -w "$plugin_link_path") $(cygpath -w "$plugin_build_dir")"
	else
		ln -sfn "$plugin_build_dir" "$plugin_link_path"
	fi

    log_success "Plugin linking completed."
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_success "Starting E2E setup process..."

    # Initialize paths
    setup_paths

    # Check prerequisites
    check_prerequisites

    # Read and validate plugin manifest
    local plugin_id
    plugin_id=$(validate_plugin_manifest "$PLUGIN_MANIFEST_PATH")

    # Execute setup steps
    unpack_obsidian_assets
    create_vault
    build_plugin
    link_plugin "$plugin_id"

    log_success "\nE2E setup process finished successfully."
}

# =============================================================================
# Script Execution
# =============================================================================

main "$@"
