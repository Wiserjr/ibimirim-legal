plugins { id("com.android.application") }

// O município é escolhido na linha de comando:
//   ./gradlew assembleDebug -Pmunicipio=alianca
// Cada um vira um aplicativo distinto: mesmo namespace Java, mas applicationId
// e rótulo próprios, senão instalar um substituiria o outro no aparelho.
val municipio = (project.findProperty("municipio") as String?) ?: "ibimirim"
// O applicationId nao aceita hifen: `br.gov.pe.vertente-do-lerio.legal` faz o
// AAPT recusar o manifesto, e foi por isso que Vertente do Lerio ficou sem APK
// enquanto os outros oito saiam sem reclamar. Cada segmento do nome de pacote
// so admite letra, digito e sublinhado, entao o slug e limpo antes de entrar.
val pacote = municipio.replace(Regex("[^a-z0-9]"), "")
val config = rootProject.file("../municipios/$municipio/municipio.json").readText()
val rotulo = Regex("\"titulo\"\\s*:\\s*\"([^\"]+)\"").find(config)!!.groupValues[1]

android {
    namespace = "br.gov.pe.ibimirim.legal"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.gov.pe.$pacote.legal"
        minSdk = 24
        targetSdk = 35
        versionCode = 12
        versionName = "1.7.2"
        manifestPlaceholders["appLabel"] = rotulo
    }

    sourceSets["main"].assets.directories.add("../../dist/$municipio")

    buildTypes {
        release { isMinifyEnabled = false; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
