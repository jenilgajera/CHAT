#!/bin/bash

echo "==========================================="
echo "Building Friends Chat APK..."
echo "==========================================="

# Set Java and Android variables
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot"
export ANDROID_HOME="C:/Users/jenil/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "Java Home is set to: $JAVA_HOME"
echo "Android SDK is set to: $ANDROID_HOME"
echo ""

cd "r:/WH/app" || exit

echo "[1/4] Building Web App (npm run build)..."
npm run build

echo ""
echo "[2/4] Checking Android Platform..."
# Agar android folder nahi hai toh npx cap add android chalega
if [ ! -d "android" ]; then
    echo "Android platform not found! Adding it now..."
    npx cap add android
fi

echo ""
echo "[3/4] Syncing files to Android (npx cap sync android)..."
npx cap sync android

echo ""
echo "[4/4] Running Gradle to build the APK..."
cd "android" || exit

# Run gradle build
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo ""
    echo "==========================================="
    echo "SUCCESS! Aapka APK ban gaya hai."
    echo "Location: r:/WH/app/android/app/build/outputs/apk/debug/app-debug.apk"
    echo "==========================================="
    
    # Agar phone USB se connected hai toh seedha run karne ke liye:
    echo "Installing and running on connected device..."
    cd "r:/WH/app" || exit
    npx cap run android
else
    echo ""
    echo "==========================================="
    echo "ERROR! APK build nahi ho paya. Upar diya gaya error check karein."
    echo "Agar download timeout error hai, toh apna internet connection check karein."
    echo "==========================================="
fi
