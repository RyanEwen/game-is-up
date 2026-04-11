# Android Wrapper

This package exists to wrap the shared PWA inside a Capacitor-based Android app.

In the devcontainer, Java 21 and the Android SDK are provisioned for you. The native `android/` project is generated locally during setup instead of being checked into git.

## Expected workflow

1. Build the web app from `apps/web`.
2. From this package, run `npm run ensure` to create or refresh the native Android project and write `local.properties` for the current SDK path.
3. Build a debug APK with `npm run assemble:debug`.
4. If your API is running on local port 4000, run `npm run adb:reverse` so the device can reach it as `http://localhost:4000`.
5. Install to a connected device with `npm run install:debug`, or use `npm run install:debug:usb` to apply the reverse mapping first.
6. Open the native project with `npm run open` when you want Android Studio.

To build an APK that uses the hosted production app at `https://app.example.com`, run `npm run assemble:debug:prod`. That sets `CAPACITOR_SERVER_URL` so the wrapper loads the production origin directly instead of the bundled local web assets.

Android Discord sign-in does not complete inside the WebView. The app opens the system browser for OAuth, receives the return through the `gameisup://auth` deep link, and then finishes the mobile session exchange against the API. During local development, keep `npm run adb:reverse` active before testing sign-in.

The repository still does not check in the generated native Android project because it depends on local SDK and toolchain state.

If `adb` inside the devcontainer cannot see your device, use Android Studio on the host or point the container at a host adb server.

Set `ADB_SERIAL` if you want the reverse mapping helper to target one specific device.
