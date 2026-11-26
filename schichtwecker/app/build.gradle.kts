import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Zugang zum Familienkalender – liegt in secret.properties (nicht im Repository)
val secret = Properties().apply {
    val f = rootProject.file("secret.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun scramble(s: String) = s.map { (it.code xor 0x5A).toString() }.joinToString(",")

android {
    namespace = "de.schichtwecker"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.schichtwecker"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.4"
        buildConfigField("String", "FK_URL", "\"${secret.getProperty("FK_URL", "")}\"")
        buildConfigField("String", "FK_CODE", "\"${scramble(secret.getProperty("FK_CODE", ""))}\"")
        buildConfigField("String", "FK_ME", "\"${secret.getProperty("FK_ME", "")}\"")
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
    buildFeatures { buildConfig = true }
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
