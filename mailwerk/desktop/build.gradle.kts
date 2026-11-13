import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm") version "2.1.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.21"
    id("org.jetbrains.compose") version "1.8.1"
}

group = "app.mailwerk"
version = "1.0.0"

kotlin { jvmToolchain(21) }

// Der Mail-Kern wird 1:1 mit der Android-App geteilt (keine Kopie)
sourceSets.main {
    kotlin.srcDir("src/main/kotlin")
    kotlin.srcDir(layout.buildDirectory.dir("shared"))
}
val copyShared by tasks.registering(Copy::class) {
    from("../app/src/main/java") {
        include("app/mailwerk/I18n.kt", "app/mailwerk/data/Models.kt", "app/mailwerk/mail/*.kt")
    }
    into(layout.buildDirectory.dir("shared"))
}
tasks.named("compileKotlin") { dependsOn(copyShared) }

// Windows-Varianten: normale PCs (x64) und ARM-Laptops (z. B. Galaxy Book S)
// nur die Windows-Grafikbausteine (Skiko) der jeweiligen Variante – alles andere ist plattformneutral
val winX64 by configurations.creating { isTransitive = false }
val winArm64 by configurations.creating { isTransitive = false }
val skikoVersion = "0.9.4.2"

dependencies {
    implementation(compose.desktop.common)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.10.2")
    implementation("jakarta.mail:jakarta.mail-api:2.1.3")
    implementation("org.eclipse.angus:angus-mail:2.0.3")
    implementation("org.eclipse.angus:angus-activation:2.0.2")
    implementation("org.jsoup:jsoup:1.18.3")
    implementation("org.xerial:sqlite-jdbc:3.47.1.0")
    implementation("net.java.dev.jna:jna-platform:5.15.0")
    implementation("org.json:json:20240303")

    "winX64"("org.jetbrains.skiko:skiko-awt-runtime-windows-x64:$skikoVersion")
    "winArm64"("org.jetbrains.skiko:skiko-awt-runtime-windows-arm64:$skikoVersion")

    // zum Ausprobieren auf dem Rechner, auf dem gebaut wird
    runtimeOnly(compose.desktop.currentOs)

    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.icegreen:greenmail:2.1.3")
    testImplementation(compose.desktop.currentOs)
    testImplementation(compose.desktop.uiTestJUnit4)
}

tasks.test {
    useJUnit()
    systemProperty("mailwerk.home", layout.buildDirectory.dir("testhome").get().asFile.absolutePath)
    systemProperty("user.language", "de")
    systemProperty("skiko.renderApi", "SOFTWARE")
}

compose.desktop {
    application {
        mainClass = "app.mailwerk.desktop.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Msi)
            packageName = "Mailwerk"
            packageVersion = "1.0.0"
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Fertige Windows-Pakete (ZIP zum Entpacken, keine Installation nötig):
//   Mailwerk-Windows-x64.zip    – normale PCs/Laptops (Intel, AMD)
//   Mailwerk-Windows-ARM64.zip  – ARM-Laptops (z. B. Samsung Galaxy Book S, Surface Pro X, Snapdragon X)
// Enthalten: Mailwerk.exe (Starter), lib/ (Programm), jre/ (Java-Laufzeit von Eclipse Temurin 21)
// ---------------------------------------------------------------------------------------------
// Schlanke Java-Laufzeiten (nur benötigte Module, ~50 MB statt 150 MB) – siehe build-jre.sh
val buildJre by tasks.registering(Exec::class) {
    commandLine("bash", "build-jre.sh")
    outputs.dirs(layout.buildDirectory.dir("jre-windows-x64"), layout.buildDirectory.dir("jre-windows-aarch64"))
    onlyIf { !layout.buildDirectory.dir("jre-windows-aarch64").get().file("bin/javaw.exe").asFile.exists() }
}

// Symbol-Bibliothek: nur die tatsächlich benutzten Symbole (statt 38 MB)
val usedIcons: Set<String> by lazy {
    fileTree("src/main/kotlin").files.flatMap { f ->
        Regex("Icons\\.(AutoMirrored\\.)?Outlined\\.(\\w+)").findAll(f.readText()).map { (if (it.groupValues[1].isNotEmpty()) "automirrored/" else "") + it.groupValues[2] }.toList()
    }.toSet()
}
val slimIcons by tasks.registering(Jar::class) {
    archiveFileName.set("material-icons-mailwerk.jar")
    destinationDirectory.set(layout.buildDirectory.dir("slim"))
    from(configurations.runtimeClasspath.map { cp -> cp.filter { it.name.startsWith("material-icons-extended") }.map { zipTree(it) } }) {
        include { el -> el.isDirectory || el.path.startsWith("META-INF") ||
            usedIcons.any { ic -> el.path == "androidx/compose/material/icons/outlined/${ic}Kt.class" ||
                (ic.startsWith("automirrored/") && el.path == "androidx/compose/material/icons/automirrored/outlined/${ic.removePrefix("automirrored/")}Kt.class") } }
    }
    includeEmptyDirs = false
}
// Datenbank-Baustein: nur Windows-Teile (statt Bausteinen für alle Betriebssysteme)
val slimSqlite by tasks.registering(Jar::class) {
    archiveFileName.set("sqlite-jdbc-windows.jar")
    destinationDirectory.set(layout.buildDirectory.dir("slim"))
    from(configurations.runtimeClasspath.map { cp -> cp.filter { it.name.startsWith("sqlite-jdbc") }.map { zipTree(it) } }) {
        exclude { el -> el.path.startsWith("org/sqlite/native/") && !el.path.startsWith("org/sqlite/native/Windows/") }
    }
}

fun windowsZip(name: String, arch: String, natives: Configuration, exe: String) =
    tasks.register<Zip>("windowsZip$name") {
        group = "distribution"
        dependsOn(tasks.jar, buildJre, slimIcons, slimSqlite)
        archiveFileName.set("Mailwerk-Windows-$name.zip")
        destinationDirectory.set(layout.buildDirectory.dir("windows"))
        duplicatesStrategy = DuplicatesStrategy.EXCLUDE
        includeEmptyDirs = false
        into("Mailwerk") {
            from("launcher/$exe") { rename { "Mailwerk.exe" } }
            from("LIESMICH.txt")
            into("lib") {
                from(tasks.jar, slimIcons, slimSqlite)
                // Programm-Bibliotheken ohne die Linux/Mac-Grafikbausteine des Bau-Rechners und ohne die verschlankten Originale …
                from(configurations.runtimeClasspath.map { cp -> cp.filter {
                    !it.name.matches(Regex("skiko-awt-runtime-(linux|macos).*")) && !it.name.startsWith("material-icons-extended") && !it.name.startsWith("sqlite-jdbc") } })
                // … dafür die Windows-Grafikbausteine der jeweiligen Variante
                from(natives)
            }
            into("jre") { from(layout.buildDirectory.dir("jre-windows-$arch")) }
        }
    }

val zipX64 = windowsZip("x64", "x64", winX64, "Mailwerk-x86_64.exe")
val zipArm = windowsZip("ARM64", "aarch64", winArm64, "Mailwerk-aarch64.exe")
tasks.register("windowsZips") { group = "distribution"; dependsOn(zipX64, zipArm) }

tasks.register("printClasspath") { doLast { println("CP=" + (configurations.runtimeClasspath.get().files + tasks.jar.get().archiveFile.get().asFile).joinToString(":")) } }
tasks.register("printTestClasspath") { dependsOn("testClasses"); doLast { println("TCP=" + sourceSets.test.get().runtimeClasspath.files.joinToString(":")) } }
