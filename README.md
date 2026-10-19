# Media Viewer

A TikTok-style Android app for browsing Reddit media (images, GIFs, videos with sound, galleries) from public subreddits and multireddits in a vertical swipe feed.

## Features

- Vertical full-screen feed with swipe paging; horizontal swipe for galleries
- Images incl. animated GIF/WebP, downsampled to the screen
- Reddit videos with sound (separate audio track kept in sync), mute toggle
- Web embeds (YouTube etc.) and link cards
- Input accepts `pics`, `r/pics+aww`, `user/<name>/m/<multi>`, `u/<name>` or full Reddit URLs
- Tap to hide/show the overlay, tap `u/…` or `r/…` to open that feed, back returns to the previous feed

## No dependencies

The app uses only Android platform APIs (`HttpURLConnection`, `org.json`, `ImageDecoder`, `VideoView`/`MediaPlayer`, `WebView`, Android Keystore). The APK contains no libraries besides `kotlin-stdlib`, to keep the supply-chain surface minimal.

## Reddit access

Reddit no longer serves `.json` listings to unauthenticated clients, so the app reads public data through `oauth.reddit.com` with an app-only token (`client_credentials` grant, no user login). It needs the client ID and secret of a Reddit app of type *personal use script* (<https://www.reddit.com/prefs/apps>). Both are entered on first start and stored AES-GCM encrypted with a key that never leaves the Android Keystore.

## Build

Requires a JDK and the Android SDK (`ANDROID_HOME`); the Gradle wrapper downloads everything else.

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## License

MIT
