import java.io.InputStream
import java.io.FileOutputStream
import java.net.URL
import java.net.URLConnection
import groovy.json.JsonSlurper

import java.util.zip.GZIPInputStream
import java.io.FileInputStream
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.FileOutputStream
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.Files
import org.apache.tools.tar.TarInputStream
import org.apache.tools.tar.TarEntry

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

    def command = "ls /"
    def process = Runtime.getRuntime().exec(command)

    // Read the output of the command
    def reader = new BufferedReader(new InputStreamReader(process.getInputStream()))
    def output = new StringBuilder()
    String line = null
    while ((line = reader.readLine()) != null) {
        output.append(line)
    }

    // Wait for the command to finish executing
    def exitCode = process.waitFor()

    // Print the output and exit code of the command
    println "Command output: ${output}"
    println "Command exit code: ${exitCode}"

//     // delete /tmp/codeql in groovy
//     new File("/tmp/codeql").deleteDir()
//
//     println "Retrieving latest CodeQL version"
//     def version = getLatestCodeQLVersion(env.TOKEN)
//
//     def url = sprintf("https://github.com/github/codeql-action/releases/download/%s/codeql-bundle-linux64.tar.gz", version)
//     def downloadPath = "/tmp/codeql.tgz"
//     println "Downloading CodeQL version ${version} from ${url} at ${downloadPath}"
//     downloadFile(url, downloadPath)
//
//     println "Extracting CodeQL bundle"
//     extract("codeql.tgz", "/tmp")
//
//     def dir = new File("/tmp/codeql").absolutePath
//     println "Current directory is ${dir}"
//     // List all files in current directory
//     println "Listing files in current directory"
//     def path = Paths.get(dir)
//
//     if (Files.exists(path) && Files.isDirectory(path)) {
//       Files.list(path).each { filePath ->
//         println filePath.toString()
//       }
//     } else {
//       println "The specified path is not a directory or does not exist."
//     }
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

    byte[] buffer = new byte[4096]
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
        FileInputStream fileInputStream = new FileInputStream(gzippedTarballPath)
        GZIPInputStream gzipInputStream = new GZIPInputStream(new BufferedInputStream(fileInputStream))
        TarInputStream tarInputStream = new TarInputStream(gzipInputStream)

        TarEntry tarEntry
        while ((tarEntry = tarInputStream.nextEntry) != null) {
            Path outputPath = Paths.get(destinationPath, tarEntry.getName())
            if (tarEntry.isDirectory()) {
                Files.createDirectories(outputPath)
            } else {
                Files.createDirectories(outputPath.getParent())
                BufferedOutputStream outputStream = new BufferedOutputStream(new FileOutputStream(outputPath.toFile()))

                byte[] buffer = new byte[4096]
                int bytesRead
                while ((bytesRead = tarInputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }

                outputStream.close()
            }
        }

        tarInputStream.close()
        gzipInputStream.close()
        fileInputStream.close()
    } catch (Exception e) {
        currentBuild.result = 'FAILURE'
        error sprintf("Unable to extract CodeQL: %s", e)
    }
}
