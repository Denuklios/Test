pluginManagement {
    repositories { maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }; mavenCentral(); gradlePluginPortal(); google() }
}
dependencyResolutionManagement {
    repositories { maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }; mavenCentral(); google() }
}
rootProject.name = "Mailwerk-Desktop"
