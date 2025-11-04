# BookTracker

Track your reading progress with BookTracker. Sync with Plex to automatically discover audiobooks and track your reading speed and completion percentage.

## Development

### Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Building for Distribution

### Prerequisites

- [Expo EAS CLI](https://docs.expo.dev/build/introduction/) installed: `npm install -g eas-cli`
- EAS account configured: `eas login`
- iOS development certificate and provisioning profile configured in EAS

### iOS Internal Distribution Build

To create an iOS internal distribution build that can update the existing app on your device:

1. **Update version numbers** (if needed):
   - Edit `app.json` to set the `version` (e.g., "1.1.0")
   - Increment the `ios.buildNumber` for each new build

2. **Build the iOS app**:

   ```bash
   eas build --platform ios --profile standalone
   ```

   This will:
   - Create an internal distribution build
   - Use the "standalone" profile configured in `eas.json`
   - Generate a build that can be installed via TestFlight or direct download

3. **Download and install**:
   - Once the build completes, EAS will provide a download link
   - Download the `.ipa` file
   - Install via TestFlight, or use a tool like [Transporter](https://apps.apple.com/us/app/transporter/id1450874784) or `xcrun altool` to install directly on your device

### Updating the App

When updating an existing installation:
- The app will automatically update if the `bundleIdentifier` matches
- Increment `ios.buildNumber` for each new build
- You can update the `version` string (e.g., "1.1.0" → "1.2.0") for major updates

### Build Profiles

The project uses the following EAS build profiles (configured in `eas.json`):

- **development**: Development client with internal distribution
- **preview**: Preview builds for internal testing
- **standalone**: Production-like builds for internal distribution (recommended for device installation)
- **production**: App Store distribution builds

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [EAS Build documentation](https://docs.expo.dev/build/introduction/): Learn how to build your app for distribution.
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
