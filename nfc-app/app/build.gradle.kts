plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("app.cash.paparazzi")
}

android {
    namespace = "app.nfcwerkstatt"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.nfcwerkstatt"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.5"
    }

    // Fester Schlüssel, damit jede neue Version als Update über die installierte App geht –
    // egal wo gebaut wird. Fehlt die Datei, wird mit dem Debug-Schlüssel signiert.
    val keystoreFile = rootProject.file("keystore/nfc-werkstatt.jks")
    signingConfigs {
        if (keystoreFile.exists()) create("werkstatt") {
            storeFile = keystoreFile
            storePassword = "nfcwerkstatt"
            keyAlias = "nfcwerkstatt"
            keyPassword = "nfcwerkstatt"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("werkstatt") ?: signingConfigs.getByName("debug")
        }
        debug {
            signingConfig = signingConfigs.findByName("werkstatt") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
