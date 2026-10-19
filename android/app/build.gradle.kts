import java.util.Properties

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

    // Release signing data stays out of the repo: android/keystore.properties (gitignored)
    // points at a keystore in ~/.android. Without it, release builds stay unsigned.
    val keystoreFile = rootProject.file("keystore.properties")
    if (keystoreFile.exists()) {
        val props = Properties().apply { keystoreFile.inputStream().use { load(it) } }
        signingConfigs {
            create("release") {
                storeFile = file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("release")
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
