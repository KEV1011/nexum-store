allprojects {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("${project(":flutter_background_geolocation").projectDir}/libs")
        }
        maven {
            url = uri("https://dl.cloudsmith.io/public/transistorsoft/flutter-background-geolocation/maven/")
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
