// ==========================================================================
// Doomy Bridge — módulo de aplicación Android REAL.
//
// ESTADO: ESTRUCTURA LISTA, NO COMPILADO EN ESTE ENTORNO.
// Este entorno de trabajo (contenedor Linux en la nube) no tiene Android
// SDK / Android Gradle Plugin instalado, y por diseño no se instaló uno
// (ver DOOMY_VISION_BLOCKERS.md) porque además de requerir ~el SDK
// completo, `mwdat-core`/`mwdat-camera`/`mwdat-mockdevice` se distribuyen
// vía GitHub Packages con autenticación (GITHUB_TOKEN), y el propio SDK
// requiere aprobación en el Developer Preview de Meta + un APPLICATION_ID
// emitido por Meta. Ninguna de esas credenciales existe en este entorno.
//
// Este módulo SÍ es código real, revisado y listo para abrir en Android
// Studio en cuanto exista acceso al Developer Preview — no es pseudocódigo.
// La lógica de negocio real y testeada vive en :core (Kotlin/JVM puro),
// que este módulo consume tal cual.
// ==========================================================================

plugins {
    id("com.android.application") version "8.7.2"
    id("org.jetbrains.kotlin.android") version "2.0.21"
}

android {
    namespace = "mx.acstechnology.doomyvision.bridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "mx.acstechnology.doomyvision.bridge"
        minSdk = 26 // Bluetooth HFP moderno + CameraX estables desde API 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions {
        jvmTarget = "21"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":core"))

    // --- Meta Wearables Device Access Toolkit v0.7.0 ---
    // Requiere maven.pkg.github.com/facebook/meta-wearables-dat-android
    // con GITHUB_TOKEN (ver settings.gradle.kts del repo real de Meta).
    // Comentado hasta tener acceso al Developer Preview:
    // implementation("com.meta.wearable:mwdat-core:0.7.0")
    // implementation("com.meta.wearable:mwdat-camera:0.7.0")
    // implementation("com.meta.wearable:mwdat-mockdevice:0.7.0")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation(kotlin("test"))
}
