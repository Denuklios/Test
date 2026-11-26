plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.schichtwecker"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.schichtwecker"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../keystore/schichtwecker.jks")
            storePassword = "schichtwecker"
            keyAlias = "schichtwecker"
            keyPassword = "schichtwecker"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
android.testOptions.unitTests.isReturnDefaultValues = true
dependencies { testImplementation("org.json:json:20240303") }
