# Mobile web app and Android shell

The field app uses the React screens migrated from Expo into `apps/mobile/web`.
Vite compiles them into a single-page app for Vercel. The Android shell in
`apps/mobile/shell` opens that site in a WebView and handles device identity,
encrypted session storage, camera, GPS permissions and Android Back.

`apps/web` remains the Next.js ERP and hosts the authenticated mobile API. The
mobile site uses same-origin `/api/mobile/*` requests that Vercel forwards to
the ERP. Both applications use the same Neon backend. Tenant identity and
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

## Host the site and build the APK

1. Release the mobile API and required existing registration migrations through
   the ERP's normal release process. Verify production storage and mobile API
   configuration before distributing the app.
2. Connect a Vercel project to this repository. Set **Root Directory** to
   `apps/mobile/web`, **Framework** to Vite and **Production Branch** to
   `blm-cloud-release`. Keep access to files outside the root directory enabled
   for the shared workspace package. The build is `pnpm build` and output is
   `dist`. The checked-in Vercel configuration forwards requests to the
   production ERP host.
3. Run GitHub Actions **Mobile checks** manually with the exact mobile site
   HTTPS origin to get a debug APK for testing, or build it locally with Gradle
   8.9, JDK 17 and Android SDK 35:

   ```sh
   cd apps/mobile/shell
   gradle -PMOBILE_WEB_URL=https://your-mobile-site.vercel.app testDebugUnitTest lintDebug assembleDebug
   ```

4. Test on Android with the deployed API and a test account. Verify device
   binding, assigned lines, photo upload, saving, Android Back and disconnect/
   reconnect. The shell stores its own device ID. For a login already bound
   in Expo Go, release that binding in the ERP before signing in with the APK.
5. Sign a release APK with the team's Android signing key for staff
   distribution. Preserve the application ID and signing key for future
   shell updates.

Mobile UI changes use the Vercel Git release. An already open screen continues
running the loaded version until a fresh launch or reload. Native features and
shell updates require an updated APK. Keep the configured HTTPS origin stable.

The Render/Metro deployment draft has been removed. The hybrid setup is local
until the production API and mobile Vercel site are released.
