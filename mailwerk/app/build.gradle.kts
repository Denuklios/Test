import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Einstellungen für die Veröffentlichung (OAuth-Client-IDs, Support-Adresse, Update-Adresse).
// Datei mailwerk.properties im Projektordner, Vorlage: mailwerk.properties.example
val cfg = Properties().apply {
    rootProject.file("mailwerk.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun cfg(key: String, default: String = "") = (cfg.getProperty(key) ?: default).trim()
fun str(v: String) = "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

// Geheimer Release-Schlüssel (nicht im Repo!): keystore.properties mit storeFile, storePassword, keyAlias, keyPassword
val ks = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    namespace = "app.mailwerk"
    compileSdk = 36

    defaultConfig {
        applicationId = cfg("applicationId", "app.mailwerk")
        minSdk = 26
        targetSdk = 36
        versionCode = 17
        versionName = "1.10"
        buildConfigField("String", "GOOGLE_CLIENT_ID", str(cfg("google.clientId")))
        buildConfigField("String", "MICROSOFT_CLIENT_ID", str(cfg("microsoft.clientId")))
        buildConfigField("String", "SUPPORT_EMAIL", str(cfg("support.email")))
        buildConfigField("String", "PRIVACY_URL", str(cfg("privacy.url",
            "https://github.com/Denuklios/Test/blob/ccr-71728653-8d4ka4/mailwerk/DATENSCHUTZ.md")))
        manifestPlaceholders["appAuthRedirectScheme"] = cfg("applicationId", "app.mailwerk")
    }

    signingConfigs {
        // Öffentlicher Schlüssel nur für die Direkt-Version im Familien-/Freundeskreis (Updates ohne Neuinstallation).
        create("shared") {
            storeFile = file("mailwerk.keystore")
            storePassword = "mailwerk"
            keyAlias = "mailwerk"
            keyPassword = "mailwerk"
        }
        // Geheimer Schlüssel für den Play Store (Upload-Schlüssel) – liegt NICHT im Repo.
        if (ks.getProperty("storeFile") != null) create("private") {
            storeFile = rootProject.file(ks.getProperty("storeFile"))
            storePassword = ks.getProperty("storePassword")
            keyAlias = ks.getProperty("keyAlias")
            keyPassword = ks.getProperty("keyPassword")
        }
    }

    flavorDimensions += "store"
    productFlavors {
        // Direkt-Version: APK zum Weitergeben, aktualisiert sich selbst über update.json
        create("direct") {
            dimension = "store"
            buildConfigField("boolean", "SELF_UPDATE", "true")
            buildConfigField("String", "UPDATE_URL", str(cfg("update.url", "https://raw.githubusercontent.com/Denuklios/Test/ccr-71728653-8d4ka4/mailwerk/")))
            signingConfig = signingConfigs.getByName("shared")
        }
        // Play-Store-Version: keine Selbst-Aktualisierung (Play-Richtlinie), Updates kommen über den Store
        create("play") {
            dimension = "store"
            buildConfigField("boolean", "SELF_UPDATE", "false")
            buildConfigField("String", "UPDATE_URL", "\"\"")
            signingConfig = signingConfigs.findByName("private")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2")
            it.maxHeapSize = "3g"
            it.systemProperty("roborazzi.test.record", "true")
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE.md", "META-INF/NOTICE.md", "META-INF/LICENSE", "META-INF/NOTICE",
                "META-INF/gfprobe-provider.xml", "META-INF/hk2-locator/**", "META-INF/native-image/**",
                "META-INF/*.kotlin_module", "META-INF/versions/**"
            )
            pickFirsts += setOf("META-INF/mailcap", "META-INF/mailcap.default", "META-INF/mimetypes.default")
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.05.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    // IMAP / SMTP
    implementation("jakarta.mail:jakarta.mail-api:2.1.3")
    implementation("org.eclipse.angus:angus-mail:2.0.3")
    implementation("org.eclipse.angus:angus-activation:2.0.2")
    // HTML-Bereinigung, Tracker-Erkennung
    implementation("org.jsoup:jsoup:1.18.3")
    // Anmeldung über Google/Microsoft (OAuth 2.0 + PKCE)
    implementation("net.openid:appauth:0.11.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("com.icegreen:greenmail:2.1.3")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.43.0")
    testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.43.0")
    testImplementation("androidx.work:work-testing:2.10.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
