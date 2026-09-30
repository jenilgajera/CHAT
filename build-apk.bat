@echo off
echo ===========================================
echo Building Friends Chat APK...
echo ===========================================

REM Set Java and Android variables
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot
set ANDROID_HOME=C:\Users\jenil\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%

echo Java Home is set to: %JAVA_HOME%
echo Android SDK is set to: %ANDROID_HOME%
echo.

REM Navigate to app folder and build web assets
cd /d "r:\WH\app"
echo [1/3] Building Web App (npm run build)...
call npm run build

echo.
echo [2/3] Syncing files to Android (npx cap sync android)...
call npx cap sync android

echo.
REM Go to the Android project folder
cd /d "r:\WH\app\android"

echo [3/3] Running Gradle to build the APK...
call .\gradlew.bat assembleDebug

echo.
IF %ERRORLEVEL% EQU 0 (
    echo ===========================================
    echo SUCCESS! Aapka APK ban gaya hai.
    echo Location: r:\WH\app\android\app\build\outputs\apk\debug\app-debug.apk
    echo ===========================================
    echo Installing and running on connected device...
    cd /d "r:\WH\app"
    call npx cap run android
) ELSE (
    echo ===========================================
    echo ERROR! APK build nahi ho paya. Upar diya gaya error check karein.
    echo Agar download timeout error hai, toh apna internet connection check karein.
    echo ===========================================
)

pause
