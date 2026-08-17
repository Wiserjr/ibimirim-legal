plugins { id("com.android.application") }

android {
    namespace = "br.gov.pe.ibimirim.legal"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.gov.pe.ibimirim.legal"
        minSdk = 24
        targetSdk = 35
        versionCode = 7
        versionName = "1.5.0"
    }

    sourceSets["main"].assets.directories.add("../../public")

    buildTypes {
        release { isMinifyEnabled = false; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
