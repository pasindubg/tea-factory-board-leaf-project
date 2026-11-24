# Mobile web app and Android shell

The field app uses the React screens migrated from Expo into `apps/mobile/web`.
Vite compiles them into a single-page app for Vercel. The Android shell in
`apps/mobile/shell` opens that site in a WebView and handles device identity,
encrypted session storage, camera, GPS permissions and Android Back.

The existing Vercel project rooted at `apps/mobile-api` builds both the
interface and the API. Its Next.js server serves the Vite interface at
`/` and the shared ERP mobile handlers at `/api/mobile/*`. Both applications
use the same Neon backend for each environment. Tenant identity and
permissions come from the server session. The APK carries the mobile site
origin and stores no server credentials.

The migrated screens cover line selection, customer registration, driver
handovers, supplier requests and messages, and the existing collector screens.
The original React Native controls render as HTML through React Native Web.
Registration retains its built-in **New** action, GPS requirement, optional
photos and automatic registration number.

## Connectivity

The app requires Wi-Fi or mobile data. If the phone disconnects, the shell
shows **Network disconnected** and blocks interaction. The open screen stays
mounted, so a draft remains available on reconnection. Users submit saves
explicitly. There is no offline data store, queued save or service worker.
An in-progress request may have reached the server before the connection
dropped. The registration keeps its record ID for safe retry.

## Run locally

Install the monorepo dependencies with `pnpm install --frozen-lockfile`.
Run the ERP API on port 3000 with `pnpm --dir apps/web dev` and the mobile site
on port 8081 with `pnpm --dir apps/mobile/web dev`. Set
`MOBILE_DEV_API_ORIGIN` to change the local proxy target. Browser testing can
exercise the layout and supplier/collector screens. Field officers and drivers
need the shell's device bridge for registration and handovers.

### Test the debug APK against the API on port 3001

Run the following from the repository root. If Vite is already running, restart
it with the proxy target below. Keep the API running on port 3001.

```sh
MOBILE_DEV_API_ORIGIN=http://127.0.0.1:3001 pnpm --dir apps/mobile/web dev --strictPort
```

Build the debug APK in another terminal with Gradle 8.9, an available JDK
(17 is the supported baseline) and Android SDK 35. Start an emulator or connect
an Android phone with USB debugging enabled.

```sh
gradle -p apps/mobile/shell -PMOBILE_WEB_URL=http://localhost:8081 assembleDebug
adb devices
adb reverse tcp:8081 tcp:8081
adb install -r apps/mobile/shell/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n lk.boardleaf.field.debug/lk.boardleaf.field.MainActivity
```

Android loads the mobile site through the forwarded port 8081. Vite on the
computer forwards `/api/mobile/*` to port 3001. Only the UI port needs ADB
forwarding. Reapply the forwarding command after a disconnect if needed. If
multiple Android devices are attached, pass `-s <device-id>` to each ADB command.
Release APKs require an HTTPS site origin.

## Host the site and build the APK

1. Keep the existing mobile Vercel project rooted at `apps/mobile-api`.
   Use the Next.js preset, build command `pnpm build`, default output directory
   and enable source files outside the root. Set the production branch to
   `blm-cloud-release`. The build compiles the screens in `apps/mobile/web`
   into this project. A single domain serves the interface and its API.
2. Configure Preview and Production using the environment settings below.
3. Run GitHub Actions **Mobile checks** manually with the exact mobile site
   HTTPS origin to get a debug APK for testing, or build it locally with Gradle
   8.9, JDK 17 and Android SDK 35:

   ```sh
   cd apps/mobile/shell
   gradle -PMOBILE_WEB_URL=https://your-mobile-site.vercel.app testDebugUnitTest lintDebug assembleDebug
   ```

4. Test on Android with the deployed API and a test account. Verify sign-in,
   assigned lines, photo upload, saving, Android Back and disconnect/reconnect.
   Drivers and field officers can use one active phone at a time. Check that a
   second phone is blocked and that it can sign in once the first phone signs
   out. An ERP owner or manager with update access can select the user under
   **User Handling → Bound devices** and choose **Release device** if the old
   phone is unavailable. A legacy device registration expires at rollout and
   the user signs in again on their phone.
5. Sign a release APK with the team's Android signing key for staff
   distribution. Preserve the application ID and signing key for future
   shell updates.

Mobile UI changes use the Vercel Git release. An already open screen continues
running the loaded version until a fresh launch or reload. Native features and
shell updates require an updated APK. Keep the configured HTTPS origin stable.

### Automatic production builds

Merge the reviewed changes into `main`, then run **Release — sync blm-cloud-release from main**. Keep the existing `RELEASE_SYNC_TOKEN` configured. This workflow pushes the release branch with a repository admin's token so the push can start downstream GitHub workflows.

- **ERP** — the ERP release workflow uses `VERCEL_DEPLOY_HOOK_URL`, which targets the ERP Vercel project. That project's build applies the shared database migrations.
- **Mobile site and API** — **Release mobile site and API** queues the existing mobile project's release hook when screens, mobile endpoints, shared ERP code or workspace dependencies change. Each deployment contains matching screens and endpoints.
- **Android shell** — a push changing `apps/mobile/shell/**` on the release branch runs **Release Android APK**. It tests, lints, builds, signs and verifies the APK, then publishes `Tea-Factory-Field.apk` under **GitHub → Releases**. The workflow also supports a manual first release from that branch.

In **GitHub → Settings → Environments**, create `mobile-release` and restrict deployment branches to `blm-cloud-release`. Add the environment variable `MOBILE_WEB_URL` with the HTTPS origin of the production **mobile site**. Add these environment secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |

Use the original signing key for an existing release installation. For a first release, create and back up a keystore. On macOS these commands prompt for passwords and copy the encoded keystore to the clipboard for the GitHub secret:

```sh
keytool -genkeypair -storetype JKS -keystore "$HOME/tea-field-release.jks" \
  -alias tea-field -keyalg RSA -keysize 3072 -validity 10000
base64 -i "$HOME/tea-field-release.jks" | pbcopy
```

The release version is `1.0.<workflow run number>` with Android version code `run number + 1`. If a production APK already exists, ensure the first automated version code exceeds its installed version. For a private repository, APK downloads require repository access.


### Preview and production settings

1. Configure the mobile project's Preview environment for the Neon preview
   branch and Production for the production branch. For each environment set
   `NEXT_PUBLIC_DATA_BACKEND=neon`, `NEON_DATABASE_URL`, `NEON_AUTH_BASE_URL`,
   `NEXT_PUBLIC_NEON_AUTH_BASE_URL`, and `NEXT_PUBLIC_NEON_DATA_API_URL`.
   Use the matching ERP environment's trusted Neon Auth origin for
   `NEXT_PUBLIC_SITE_URL` and its storage settings for `AWS_ENDPOINT_URL_S3`,
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.
2. Merge to `main` for a Vercel Git preview. The build verifies the branch
   and Neon endpoint match. Open the preview URL, check the login screen,
   then run **Mobile checks** manually with that URL for a debug APK.
   The emulator or phone needs access to the preview URL.
3. Keep the production hook for `blm-cloud-release` in the existing
   `VERCEL_MOBILE_API_DEPLOY_HOOK_URL` repository secret. The ERP deployment
   applies migrations. The mobile production build waits up to five minutes
   for them. Retry after the ERP build succeeds if it takes longer. Refresh
   the target Neon Data API schema cache when adding RPCs.
4. Set `mobile-release` → `MOBILE_WEB_URL` to this mobile project's stable
   production HTTPS origin. An APK built with another origin needs one shell
   release to switch. Screen and API updates at the same origin take effect
   on reload. The old external proxy variable `MOBILE_API_ORIGIN` is obsolete.
