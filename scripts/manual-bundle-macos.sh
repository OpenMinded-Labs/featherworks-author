#!/usr/bin/env bash
set -euo pipefail
APP_NAME="FeatherWorks Author"
# Cargo emits the crate name from Cargo.toml (underscored), not the display name.
BINARY_PATH="src-tauri/target/release/featherworks_author"
APP_DIR="src-tauri/target/release/bundle/macos/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

if [ ! -f "$BINARY_PATH" ]; then
  echo "Binary fehlt: $BINARY_PATH" >&2
  exit 1
fi

rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES"

# Info.plist minimal
cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>FeatherWorks Author</string>
  <key>CFBundleDisplayName</key><string>FeatherWorks Author</string>
  <key>CFBundleIdentifier</key><string>com.featherworks.author</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleExecutable</key><string>featherworks-author</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Kopiere Binary und benenne es um auf CFBundleExecutable
cp "$BINARY_PATH" "$MACOS/featherworks-author"
chmod +x "$MACOS/featherworks-author"

# Icon (falls Vorhanden: benutze 512x512.png als Basis icns)
ICON_SRC="src-tauri/icons/512x512.png"
if [ -f "$ICON_SRC" ]; then
  # iconutil only accepts a directory ending in `.iconset`.
  TMP_ICONSET="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "$TMP_ICONSET"
  sips -z 16 16     "$ICON_SRC" --out "$TMP_ICONSET/icon_16x16.png" >/dev/null
  sips -z 32 32     "$ICON_SRC" --out "$TMP_ICONSET/icon_16x16@2x.png" >/dev/null
  sips -z 32 32     "$ICON_SRC" --out "$TMP_ICONSET/icon_32x32.png" >/dev/null
  sips -z 64 64     "$ICON_SRC" --out "$TMP_ICONSET/icon_32x32@2x.png" >/dev/null
  sips -z 128 128   "$ICON_SRC" --out "$TMP_ICONSET/icon_128x128.png" >/dev/null
  sips -z 256 256   "$ICON_SRC" --out "$TMP_ICONSET/icon_128x128@2x.png" >/dev/null
  sips -z 256 256   "$ICON_SRC" --out "$TMP_ICONSET/icon_256x256.png" >/dev/null
  sips -z 512 512   "$ICON_SRC" --out "$TMP_ICONSET/icon_256x256@2x.png" >/dev/null
  cp "$ICON_SRC" "$TMP_ICONSET/icon_512x512.png"
  cp "$ICON_SRC" "$TMP_ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$TMP_ICONSET" -o "$RESOURCES/AppIcon.icns" || true
  rm -rf "$TMP_ICONSET"
  echo "Icon erzeugt: $RESOURCES/AppIcon.icns"
fi

echo "Manuelles Bundle erstellt: $APP_DIR"
