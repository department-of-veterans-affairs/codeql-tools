import java.io.InputStream
import java.io.FileOutputStream
import java.net.URL
import java.net.URLConnection
import groovy.json.JsonSlurper

import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.nio.file.Files
import java.nio.file.Paths

def call(org, repo, branch, language, buildCommand, token, installCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(branch == "") {
        // TODO: This doesn't work if branch includes a slash in it, split and reform based on branch name
        env.BRANCH = env.GIT_BRANCH.split('/')[1]
    } else {
        env.BRANCH = branch
    }
    env.BUILD_COMMAND = buildCommand
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    env.GITHUB_TOKEN = token
    if(installCodeQL == true || installCodeQL == "true") {
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = language
    env.ORG = org
    env.REPO = repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)

def dir = new File('.').absolutePath
println "Current directory: ${dir}"

    println "Retrieving latest CodeQL version"
    def version = getLatestCodeQLVersion(env.TOKEN)

    def url = sprintf("https://github.com/github/codeql-action/releases/download/%s/codeql-bundle-linux64.tar.gz", version)
    def downloadPath = sprintf("%s/codeql.tgz", env.WORKSPACE)
    println "Downloading CodeQL version ${version} from ${url} at ${downloadPath}"
    downloadFile(url, "codeql.tgz")

    println "Extracting CodeQL bundle"
    extract("codeql.tgz", ".")
}

def getLatestCodeQLVersion(token) {
    def urlStr = "https://api.github.com/repos/github/codeql-action/releases/latest"

    URL url = new URL(urlStr)
    URLConnection connection = url.openConnection()
    connection.setRequestProperty("Accept", "application/vnd.github+json")
    connection.setRequestProperty("Authorization", "token ${token}")
    connection.connect()

    JsonSlurper jsonSlurper = new JsonSlurper()
    def jsonObject = jsonSlurper.parseText(connection.content.text)

    def tagName = jsonObject.tag_name
    return tagName
}

def downloadFile(fileUrl, filePath) {
    println "Downloading file from ${fileUrl}"
    URL url = new URL(fileUrl)
    InputStream inStream = url.openStream()
    FileOutputStream outStream = new FileOutputStream(filePath)

    byte[] buffer = new byte[1024]
    int bytesRead

    while ((bytesRead = inStream.read(buffer)) != -1) {
        outStream.write(buffer, 0, bytesRead)
    }

    println "File downloaded successfully to ${filePath}"
    inStream.close()
    outStream.close()
}

def extract(String gzippedTarballPath, String destinationPath) {
    try {
        def gzipPath = Paths.get(gzippedTarballPath).normalize().toString()
        def destPath = Paths.get(destinationPath).normalize().toString()

        println("Verify paths exist for ${gzipPath} and ${destPath}")
        def tarballFile = Paths.get(gzipPath)
        def destinationDir = Paths.get(destPath)

        println("Extracting ${gzipPath} to ${destPath}")
        tarballFile.withInputStream { fis ->
            printf("Building GZIP compressor")
            GzipCompressorInputStream gzipIn = new GzipCompressorInputStream(fis)
            printf("Building TAR extractor")
            TarArchiveInputStream tarIn = new TarArchiveInputStream(gzipIn)

            def entry

            printf("Extracting tarball")
            while ((entry = tarIn.nextTarEntry) != null) {
                def path = sprintf("%s/%s", destinationDir, entry.name)
                printf("Extracting %s to %s\n", entry.name, path)
                def entryPath = Paths.get(path).normalize().toString()
                def outputFile = Paths.get(entryPath)

                if (entry.isDirectory()) {
                    outputFile.createDirectories()
                } else {
                    outputFile.withOutputStream { fos ->
                        tarIn.transferTo(fos)
                    }
                }
            }

            tarIn.close()
            gzipIn.close()
        }
    } catch (Exception e) {
        currentBuild.result = 'FAILURE'
        error sprintf("Unable to extract CodeQL: %s", e)
    }
}
