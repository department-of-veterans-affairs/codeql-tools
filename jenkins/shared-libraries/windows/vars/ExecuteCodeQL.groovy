import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream

def call(Org, Repo, Branch, Language, BuildCommand, Token, InstallCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("token %s", Token)
    if(Branch == "") {
        env.BRANCH = env.GIT_BRANCH
    } else {
        env.BRANCH = Branch
    }
    env.BUILD_COMMAND = BuildCommand
    if(!env.CODEQL_RAM) {
        env.CODEQL_RAM_FLAG = ""
    } else {
        env.CODEQL_RAM_FLAG = sprintf("--ram %s", env.CODEQL_RAM.trim())
    }
    if(!env.CODEQL_THREADS) {
        env.CODEQL_THREADS_FLAG = "--threads 0"
    } else {
        env.CODEQL_THREADS_FLAG = sprintf("--threads %s", env.CODEQL_THREADS.trim())
    }
    env.CONFIG_FILE = "${env.WORKSPACE}\\.github\\codeql-config.yml"
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", Language)
    env.DATABASE_PATH = sprintf("%s-%s", Repo, Language)
    env.GITHUB_TOKEN = Token
    if(InstallCodeQL == true || InstallCodeQL == "true") {
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = Language
    if(env.LANGUAGE == "swift") {
        env.CODEQL_ENABLE_EXPERIMENTAL_FEATURES_SWIFT = true
    }
    env.ORG = Org
    env.REPO = Repo
    env.REF = sprintf("refs/heads/%s", env.BRANCH)
    if(env.CHANGE_ID) {
        env.REF = sprintf("refs/pull/%s/head", env.CHANGE_ID)
    }
    env.SARIF_FILE = sprintf("%s-%s.sarif", Repo, Language)
    env.UPLOAD_URL = sprintf("https://uploads.github.com/repos/%s/%s/code-scanning/codeql/databases/%s?name=%s", Org, Repo, Language, env.DATABASE_BUNDLE)
    env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-code-scanning.qls", language, language)
    if(env.ENABLE_EXTENDED_QUERIES) {
        env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-extended.qls", language, language)
    } else if(env.ENABLE_EXTENDED_QUERIES &&  env.ENABLE_EXTENDED_QUERIES == "true") {
        env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-extended.qls", language, language)
    }
    if(!env.UPLOAD_RESULTS) {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "true") {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "false") {
        env.UPLOAD_RESULTS = false
    }

    powershell """
        Write-Output "WORKSPACE: \$Env:WORKSPACE"
        Write-Output "PWD: \$pwd"

        \$json_file = "\$Env:WORKSPACE\\.github\\emass.json"

        Write-Output "Validating \$json_file"
        if (!(Test-Path \$json_file)) {
            Write-Output "Error: .github\\emass.json not found, please refer to the OIS documentation on creating the emass.json file"
            Exit 1
        }

        \$output = Get-Content \$json_file -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
        if (!\$?) {
            Write-Output "Error: malformed emass.json file, please refer to the OIS documentation on creating the emass.json file"
            Exit 4
        }

        if (\$output.systemID -le 0 -and \$output.systemID -ne -1) {
            Write-Output "Error: systemID is invalid"
            Exit 5
        }

        if (\$output.systemOwnerEmail -notmatch "@") {
            Write-Output "Error: systemOwnerEmail is invalid"
            Exit 6
        }


        \$ProgressPreference = 'SilentlyContinue'
        if("\$Env:INSTALL_CODEQL" -eq "false") {
            Write-Output "Skipping installation of CodeQL"
        } else {
            Write-Output "Installing CodeQL"

            Write-Output "Retrieving latest CodeQL release"
            \$Headers = @{
                "Authorization" = "\$Env:AUTHORIZATION_HEADER"
                "Accept" = "application/vnd.github.raw"
            }
            \$Request = Invoke-WebRequest -UseBasicParsing -Method Get -Headers  \$Headers -Uri "https://api.github.com/repos/github/codeql-action/contents/src/defaults.json"
            \$Json = \$Request | ConvertFrom-Json
            \$Id = \$Json.bundleVersion

            Write-Output "Downloading CodeQL archive for version '\$Id'"
            \$ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Method Get -OutFile "codeql.tgz" -Uri "https://github.com/github/codeql-action/releases/download/\$Id/codeql-bundle-win64.tar.gz"

            Write-Output "Extracting CodeQL archive"
            tar -xf codeql.tgz --directory "\$pwd"

            Write-Output "Removing CodeQL bundle archive"
            Remove-Item "\$pwd\\codeql.tgz"
            \$ProgressPreference = 'Continue'

            Write-Output "CodeQL installed"
        }
    """

    powershell """
        Write-Output "Current Jenkins Workspace: \$Env:WORKSPACE"
        Write-Output "Current working directory: \$pwd"
        Write-Output "CodeQL config file: \$Env:CONFIG_FILE"
        Write-Output "CodeQL database path: \$Env:DATABASE_PATH"
        Write-Output "CodeQL database bundle file name: \$Env:DATABASE_BUNDLE"

        Write-Output "Initializing database"
        if (!(Test-Path "\$Env:CONFIG_FILE")) {
            if ("\$Env:BUILD_COMMAND" -eq "") {
                Write-Output "No build command specified, using default"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    Invoke-Expression ".\\codeql\\codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --source-root ."
                } else {
                    Invoke-Expression "codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --source-root ."
                }
            } else {
                Write-Output "Build command specified, using '\$Env:BUILD_COMMAND'"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    Invoke-Expression ".\\codeql\\codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --source-root . --command '\$Env:BUILD_COMMAND'"
                } else {
                    Invoke-Expression "codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --source-root . --command '\$Env:BUILD_COMMAND'"
                }
            }
        } else {
            if ("\$Env:BUILD_COMMAND" -eq "") {
                Write-Output "No build command specified, using default"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    Invoke-Expression ".\\codeql\\codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --codescanning-config '\$Env:CONFIG_FILE' --source-root ."
                } else {
                    Invoke-Expression "codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --codescanning-config '\$Env:CONFIG_FILE' --source-root ."
                }
            } else {
                Write-Output "Build command specified, using '\$Env:BUILD_COMMAND'"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    Invoke-Expression ".\\codeql\\codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --codescanning-config '\$Env:CONFIG_FILE' --source-root . --command '\$Env:BUILD_COMMAND'"
                } else {
                    Invoke-Expression "codeql database create '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --language '\$Env:LANGUAGE' --codescanning-config '\$Env:CONFIG_FILE' --source-root . --command '\$Env:BUILD_COMMAND'"
                }
            }
        }
        Write-Output "Database initialized"

        Write-Output "Checking if current working directory and Jenkins workspace are the same directory"
        if (\$Env:WORKSPACE -eq \$PWD) {
            Write-Output "The current directory and \$Env:WORKSPACE match"
            \$Env:CWD = ""
            \$Env:SEP = ""
        } else {
            Write-Output "The current working directory and Jenkins workspace do not match, updating the SARIF category value to deduplicate Code Scanning results"
            \$Env:CWD = Split-Path "\$PWD" -Leaf
            \$Env:SEP = "-"
        }
        Write-Output "The SARIF category has been configured to ois-\$Env:LANGUAGE\$Env:SEP\$Env:CWD"

        Write-Output "Analyzing database"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            Invoke-Expression ".\\codeql\\codeql database analyze --no-download '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --sarif-category 'ois-\$Env:LANGUAGE\$Env:SEP\$Env:CWD' --format "sarifv2.1.0" --output '\$Env:SARIF_FILE' '\$Env:QL_PACKS'"
        } else {
            Invoke-Expression "codeql database analyze --no-download '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG \$Env:CODEQL_RAM_FLAG --sarif-category 'ois-\$Env:LANGUAGE' --format "sarifv2.1.0" --output '\$Env:SARIF_FILE' '\$Env:QL_PACKS'"
        }
        Write-Output "Database analyzed"
        Write-Output "Generating CSV of results"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            Invoke-Expression ".\\codeql\\codeql database interpret-results '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG --format=csv --output='codeql-scan-results-\$Env:LANGUAGE.csv' '\$Env:QL_PACKS'"
        } else {
            Invoke-Expression "codeql database interpret-results '\$Env:DATABASE_PATH' \$Env:CODEQL_THREADS_FLAG --format=csv --output='codeql-scan-results-\$Env:LANGUAGE.csv' '\$Env:QL_PACKS'"
        }
        Write-Output "CSV of results generated"

        if("\$Env:UPLOAD_RESULTS" -eq "true") {
            Write-Output "Uploading SARIF file"
            \$Commit = "\$(git rev-parse HEAD)"
            if("\$Env:INSTALL_CODEQL" -eq "true") {
                .\\codeql\\codeql github upload-results --repository "\$Env:ORG/\$Env:REPO"  --ref "\$Env:REF" --commit "\$Commit" --sarif="\$Env:SARIF_FILE"
            } else {
                codeql github upload-results --repository "\$Env:ORG/\$Env:REPO"  --ref "\$Env:REF" --commit "\$Commit" --sarif="\$Env:SARIF_FILE"
            }
            Write-Output "SARIF file uploaded"
        }

        Write-Output "Generating Database Bundle"
        \$DatabaseBundle = "\$Env:DATABASE_BUNDLE"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            .\\codeql\\codeql database bundle "\$Env:DATABASE_PATH" --output "\$Env:DATABASE_BUNDLE"
        } else {
            codeql database bundle "\$Env:DATABASE_PATH" --output "\$Env:DATABASE_BUNDLE"
        }
        Write-Output "Database Bundle Generated"

        if("\$Env:UPLOAD_RESULTS" -eq "true") {
            Write-Output "Uploading Database Bundle"
            \$Headers = @{
                "Content-Length" = "\$((Get-Item \$Env:DATABASE_BUNDLE).Length)"
                "Authorization" = "\$Env:AUTHORIZATION_HEADER"
            }
            Invoke-RestMethod -ContentType "application/zip" -Headers \$Headers -Method Post -InFile "\$Env:DATABASE_BUNDLE" -Uri "\$Env:UPLOAD_URL"
            Write-Output "Database Bundle Uploaded"
        }
    """
}

def extract(String gzippedTarballPath, String destinationPath) {
    def tarballFile = new File(gzippedTarballPath)
    def destinationDir = new File(destinationPath)

    if (!tarballFile.exists()) {
        error "Error: Tarball file not found at ${gzippedTarballPath}"
    }

    if (!destinationDir.exists()) {
        destinationDir.mkdirs()
    }

    tarballFile.withInputStream { fis ->
        GzipCompressorInputStream gzipIn = new GzipCompressorInputStream(fis)
        TarArchiveInputStream tarIn = new TarArchiveInputStream(gzipIn)

        def entry

        while ((entry = tarIn.nextTarEntry) != null) {
            def outputFile = new File(destinationDir, entry.name)

            if (entry.isDirectory()) {
                outputFile.mkdirs()
            } else {
                outputFile.withOutputStream { fos ->
                    tarIn.transferTo(fos)
                }
            }
        }

        tarIn.close()
        gzipIn.close()
    }
}
