import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase Google Services — solo si google-services.json existe
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

val localProperties = Properties()
rootProject.file("local.properties").takeIf { it.exists() }
    ?.inputStream()?.use { localProperties.load(it) }

val keystoreFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystoreFile.exists()) {
    keystoreFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    // El NAMESPACE se queda como nació y NO sigue al applicationId. No es un
    // olvido: el namespace es el paquete del código (dónde vive MainActivity y
    // de dónde salen R y BuildConfig), y el manifiesto la declara como
    // `.MainActivity`, relativo a él. Cambiarlo obliga a mover los .kt y
    // reescribir sus `package`, y si se hace a medias la app compila y revienta
    // al abrirse con ClassNotFoundException. No lo ve nadie y no es la
    // identidad en Play: esa es el applicationId de abajo.
    namespace = "com.nexum.driver_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Requerido por flutter_local_notifications (APIs java.time en minSdk 21)
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // LA IDENTIDAD DE LA APP EN GOOGLE PLAY. Es lo ÚNICO que no se puede
        // cambiar una vez publicada: cambiarlo después crea una ficha nueva,
        // con cero instalaciones y cero reseñas, y quien la tuviera deja de
        // recibir actualizaciones. Cada cambio aquí obliga además a crear la
        // app con este mismo paquete en Firebase y renovar el secreto
        // GOOGLE_SERVICES_BASE64, o el build se para (a propósito: el
        // google-services.json de otra app produce un APK sin avisos).
        applicationId = "com.zipa.conductor"
        minSdk = 21
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] =
            (project.findProperty("GOOGLE_MAPS_API_KEY") as String?
                ?: System.getenv("GOOGLE_MAPS_API_KEY")
                ?: localProperties.getProperty("google.maps.api.key")
                ?: "")
    }

    signingConfigs {
        create("release") {
            if (keystoreFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystoreFile.exists()) signingConfigs.getByName("release")
                           else signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
