# Pandiyan Stores Android app

Replacement app for the existing Google Play listing, implemented with Google Android Browser Helper (Trusted Web Activity). Opens https://pandiyan-stores.vercel.app/ with browser-managed cookies, authentication and HTTPS. No product or customer data is copied into the Android bundle.

- Application ID: `com.pandiyanstore.app`
- Version: `2.0.0` (code `2`; Play Console contained only code `1` on 2026-10-28)
- Minimum API 24 (Android 7; required by Android Browser Helper 2.7.4); target/compile API 36
- AGP 8.13.2, Gradle 8.13, JDK 17, Android Browser Helper 2.7.4

## Build

Run `./android-app/build.ps1` from PowerShell. Build tools are isolated in `.local/android-toolchain`. On another machine install JDK 17 and Android SDK 36/build-tools 35, set `local.properties`, set `PANDIYAN_SIGNING_DIR` to the signing directory, and use `gradlew.bat :app:bundleRelease :app:assembleRelease :app:lintRelease`.

The private PKCS12 keystore and password remain outside the repository in the user profile. Never commit, publish, or upload either file to the website. The public PEM is for the Play Console upload-key reset only.

## Website association

`website-files/.well-known/assetlinks.json` is also staged at `frontend/public/.well-known/assetlinks.json`. Deploy this static JSON with the normal website release, then verify the HTTPS URL returns JSON (not the SPA HTML page), without redirects. It contains Google's app-signing certificate, which signs apps installed through Play.

Until association is deployed and verified, the browser can show a toolbar instead of the fullscreen app. An APK signed locally with the upload key has a different signature from Play's app-signing key. Use a Play internal testing release after the reset becomes effective to verify fullscreen and upgrades. The local APK cannot replace an existing Play-signed installation.

## Release gates

1. Google must finish the pending upload-key reset and reach its effective date.
2. Deploy and verify website association.
3. Test a Play-installed build on Android: launch, back navigation, login/logout, catalogue, cart, checkout, external payment/support links, offline/reconnect and upgrade from the old app. Do not create real purchases merely to test.
4. Confirm the live privacy policy, account deletion provisions, Data safety answers, app access instructions, screenshots, content rating and store listing match the actual website. Review the app-removal policy notice before resubmission.
5. Submit the tested AAB for review. Account reinstatement does not by itself restore the removed app.

The original release remains in Play Console. Its backup download was blocked by Edge; no successful local backup is claimed. No existing release was deleted.

## Observed website blockers (2026-10-28)

The live privacy-policy dialog explicitly displays “Draft — owner and legal review required.” Its rights section says no self-service account-deletion feature is identified and asks the store to confirm its deletion/retention process. Finalize accurate disclosures and the required deletion request flows before answering Play Data safety / account-deletion questions or submitting for review. Packaging the site does not resolve these website-level issues.

A browser smoke check confirmed the storefront and catalogue load. No Android device was connected to ADB during preparation. Android runtime, checkout, certificate association and existing-user upgrade tests are not yet verified.

Upload-key activation confirmed by the owner-supplied Google email: 2026-10-30 12:49 UTC / 18:19 IST. Uploads are blocked until this time.

This replacement uses the website backend and browser login. It does not migrate customer accounts, order data, wallet balances, or login sessions from the previous app/backend. Confirm any required migration before releasing to existing users.
