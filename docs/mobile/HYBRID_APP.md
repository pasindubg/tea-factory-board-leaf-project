# Mobile web app and Android shell

The field app uses the React screens migrated from Expo into `apps/mobile/web`.
Vite compiles them into a single-page app for Vercel. The Android shell in
`apps/mobile/shell` opens that site in a WebView and handles device identity,
encrypted session storage, camera, GPS permissions and Android Back.

`apps/mobile-api` is the Next.js project that hosts the authenticated mobile
API. It imports the mobile handlers from `apps/web` so the ERP and standalone
API use the same implementation. The mobile site forwards same-origin
`/api/mobile/*` requests to the standalone project. The API and ERP use the
same Neon backend for each environment. Tenant identity and
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

1. Release the mobile API and required existing registration migrations through
   the ERP's normal release process. Verify production storage and mobile API
   configuration before distributing the app.
2. Connect a Vercel project to this repository. Set **Root Directory** to
   `apps/mobile/web`, **Framework** to Vite and **Production Branch** to
   `blm-cloud-release`. Keep access to files outside the root directory enabled
   for the shared workspace package. The build is `pnpm build` and output is
   `dist`. Set its production `MOBILE_API_ORIGIN` to the standalone API
   project's stable HTTPS origin.
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

The Render/Metro deployment draft has been removed. The hybrid setup is local
until the production API and mobile Vercel site are released.

### Automatic production builds

Merge the reviewed changes into `main`, then run **Release — sync blm-cloud-release from main**. Keep the existing `RELEASE_SYNC_TOKEN` configured. This workflow pushes the release branch with a repository admin's token so the push can start downstream GitHub workflows.

- **ERP** — the ERP release workflow uses `VERCEL_DEPLOY_HOOK_URL`, which targets the ERP Vercel project. That project's build applies the shared database migrations.
- **Mobile API** — **Release mobile API** calls the standalone Vercel project's hook on release-branch changes to the API, its shared ERP code or workspace dependencies. Setup for that project is below.
- **Mobile screens** — the APK opens the mobile site's HTTPS origin. The mobile site's Vercel rewrite forwards API calls to `MOBILE_API_ORIGIN`.
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


### Standalone mobile API on Vercel

1. Create a Vercel project linked to this repository. Set **Root Directory**
   to `apps/mobile-api`, **Framework** to Next.js and **Production Branch** to
   `blm-cloud-release`. Enable **Include source files outside of the Root
   Directory** so Next.js can bundle the shared handlers.
2. Add the same production Neon values used by the ERP for
   `NEXT_PUBLIC_DATA_BACKEND`, `NEON_DATABASE_URL`, `NEON_AUTH_BASE_URL`,
   `NEXT_PUBLIC_NEON_AUTH_BASE_URL`, and `NEXT_PUBLIC_NEON_DATA_API_URL`. Also
   configure the same storage bucket access through `AWS_ENDPOINT_URL_S3`,
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Set
   `NEXT_PUBLIC_SITE_URL` to the ERP's existing trusted Neon Auth origin.
   Keep these credentials in the API project.
3. In the mobile API project's **Settings → Git → Deploy Hooks**, create a
   hook for `blm-cloud-release`. Save the hook URL as the repository's GitHub
   Actions secret `VERCEL_MOBILE_API_DEPLOY_HOOK_URL`.
4. Run **Release mobile API** from `blm-cloud-release` for the first release.
   The API build gives the ERP up to five minutes to finish migrations. If the
   ERP takes longer, retry the mobile API build after it succeeds. Refresh
   the production Neon Data API schema cache when the release adds RPCs.
   Verify the standalone URL returns HTTP 401 to an anonymous
   `POST /api/mobile/bootstrap` and HTTP 404 to `GET /dashboard`.
5. Set the mobile *site* project's `MOBILE_API_ORIGIN` to that API origin,
   deploy the site, and verify the same bootstrap response through the site.
   Existing APKs use it on the next launch.

For separate local processes, configure the development Neon variables for
`apps/mobile-api`, run `pnpm --dir apps/mobile-api dev` on port 3001, and
point the mobile Vite server there using `MOBILE_DEV_API_ORIGIN`.
