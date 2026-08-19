#!/usr/bin/env bash
#
# Quattro Command installer — a vector missile-defence cabinet for the
# Omarchy shell.
#
# Run it from a clone of the repo:  ./install.sh
#
# What it does:
#   1. Registers the plugin (omarchy plugin add — never a file copy, or
#      `omarchy plugin update` could never fast-forward it later).
#   2. Enables it and places the bar icon on the right.
#   3. Mentions qt6-multimedia if it is missing. The game runs without it;
#      it just runs silent.
#
# Nothing here is required: the sounds ship as WAVs and the shaders ship
# pre-compiled, so the plugin needs no build step and `omarchy plugin add` on
# its own works fine too.
#
# Overrides:
#   QCOMMAND_REPO=user/repo               register from a different repo
#   QCOMMAND_SECTION=left|center|right    where the bar icon lands
set -euo pipefail

REPO="${QCOMMAND_REPO:-28allday/Quattro-Command}"
SECTION="${QCOMMAND_SECTION:-right}"
PLUGIN_ID="nosignal.quattro-command"

say() { printf '%s\n' "$*"; }

if ! command -v omarchy >/dev/null 2>&1; then
  say "This needs Omarchy 4 (the omarchy CLI is not on PATH)."
  exit 1
fi

# Already installed? Then this is an update, not an install.
if omarchy plugin list 2>/dev/null | grep -q "^${PLUGIN_ID}[[:space:]]"; then
  say "==> ${PLUGIN_ID} is already installed; updating"
  omarchy plugin update "$PLUGIN_ID"
else
  say "==> Registering ${PLUGIN_ID} from ${REPO}"
  # --yes only when there is no terminal to prompt on: with a TTY the user
  # gets the placement prompt they would get from a bare `plugin add`.
  if [ -t 0 ] && [ -t 1 ]; then
    omarchy plugin add "https://github.com/${REPO}"
  else
    omarchy plugin add "https://github.com/${REPO}" --yes
  fi
fi

say "==> Enabling and placing the bar icon (${SECTION})"
omarchy plugin enable "$PLUGIN_ID" --section "$SECTION" || true
# A fresh unattended add can race the registry's rescan and land the widget in
# center regardless of defaultSection, so place it explicitly afterwards.
omarchy bar move "$PLUGIN_ID" --section "$SECTION" >/dev/null 2>&1 || true

if ! pacman -Qq qt6-multimedia >/dev/null 2>&1; then
  say ""
  say "Note: qt6-multimedia is not installed, so the game will run silent."
  say "      For sound:  sudo pacman -S qt6-multimedia"
fi

say ""
say "Done. Click the crosshair in the bar, or bind a key to:"
say "  omarchy-shell shell toggle ${PLUGIN_ID}"
