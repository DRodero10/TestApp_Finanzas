#!/usr/bin/env bash
# Builds Finanzas.apk without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Needs a JDK (17+) and the Android SDK (build-tools 34+, platform android-34).
set -euo pipefail
cd "$(dirname "$0")"

# --- Tools
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
  for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -d "$d/build-tools" ]; then SDK="$d"; break; fi
  done
fi
[ -n "$SDK" ] && [ -d "$SDK/build-tools" ] || { echo "Android SDK not found. Set ANDROID_HOME."; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
AJ="$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
[ -f "${AJ:-}" ] || { echo "Android platform not found. Run: sdkmanager \"platforms;android-34\""; exit 1; }
if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/.local/jdk" ]; then
  JAVA_HOME="$(ls -d "$HOME"/.local/jdk/*/Contents/Home 2>/dev/null | sort -V | tail -1 || true)"
fi
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
KEYTOOL="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
command -v "$JAVAC" >/dev/null 2>&1 || { echo "JDK not found. Install JDK 17 and set JAVA_HOME."; exit 1; }
export JAVA_HOME PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"

# --- Build
rm -rf out && mkdir -p out/gen out/classes
"$BT/aapt2" compile --dir app/res -o out/res.zip
"$BT/aapt2" link -o out/base.apk -I "$AJ" --manifest app/AndroidManifest.xml --java out/gen out/res.zip \
  --min-sdk-version 26 --target-sdk-version 34 -A app/assets
"$JAVAC" -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$AJ:$BT/core-lambda-stubs.jar" -classpath "$AJ" \
  -encoding UTF-8 -d out/classes $(find app/src out/gen -name '*.java')
"$BT/d8" --release --min-api 26 --lib "$AJ" --output out $(find out/classes -name '*.class')
(cd out && zip -qj base.apk classes.dex)
"$BT/zipalign" -f -p 4 out/base.apk out/aligned.apk

# --- Sign with your own key (created once; updates need the same key, so keep finanzas.keystore)
if [ ! -f finanzas.keystore ]; then
  "$KEYTOOL" -genkeypair -keystore finanzas.keystore -alias finanzas -keyalg RSA -keysize 2048 -validity 20000 \
    -storepass finanzas -keypass finanzas -dname "CN=Finanzas" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks finanzas.keystore --ks-pass pass:finanzas --key-pass pass:finanzas --out Finanzas.apk out/aligned.apk
echo "Built Finanzas.apk ($(du -h Finanzas.apk | cut -f1))"
