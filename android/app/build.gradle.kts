plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "de.hasan.mediaviewer"
    compileSdk = 36
    defaultConfig {
        applicationId = "de.hasan.mediaviewer"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        aidl = false
        buildConfig = false
        shaders = false
    }
}

// Intentionally no dependencies: everything uses the Android platform APIs
// (HttpURLConnection, org.json, ImageDecoder, VideoView, Android Keystore).
