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
    env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-and-quality.qls", language, language)
    if(!env.UPLOAD_RESULTS) {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "true") {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "false") {
        env.UPLOAD_RESULTS = false
    }

    powershell """
        Write-Output "WORKSPACE: \$Env:WORKSPACE"
        Set-Location -Path \$Env:WORKSPACE

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

        if("\$Env:INSTALL_CODEQL" -eq "false") {
            Write-Output "Skipping installation of CodeQL"
        } else {
            Write-Output "Installing CodeQL"

            Write-Output "Retrieving latest CodeQL release"
            \$Headers = @{
                "Authorization" = "\$Env:AUTHORIZATION_HEADER"
                "Accept" = "application/vnd.github+json"
            }
            \$Request = Invoke-WebRequest -UseBasicParsing -Method Get -Headers  \$Headers -Uri "https://api.github.com/repos/github/codeql-action/releases/latest"
            \$Json = \$Request.Content | ConvertFrom-Json
            \$Id = \$Json.tag_name

            Write-Output "Downloading CodeQL archive for version '\$Id'"
            \$ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Method Get -OutFile "codeql.tgz" -Uri "https://github.com/github/codeql-action/releases/download/\$Id/codeql-bundle-win64.tar.gz"

            Write-Output "Extracting CodeQL archive"
            tar -xf codeql.tgz --directory "\$Env:WORKSPACE"

            Write-Output "Removing CodeQL bundle archive"
            Remove-Item "\$Env:WORKSPACE\\codeql.tgz"
            \$ProgressPreference = 'Continue'

            Write-Output "CodeQL installed"
        }
    """

    powershell """
        Write-Output "WORKSPACE: \$Env:WORKSPACE"
        Write-Output "Initializing database"
        Write-Output "CodeQL Config file: \$Env:CONFIG_FILE"

        if (!(Test-Path "\$Env:CONFIG_FILE")) {
            if ("\$Env:BUILD_COMMAND" -eq "") {
                Write-Output "No build command specified, using default"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    "\$Env:WORKSPACE\\codeql\\codeql database create \$Env:DATABASE_PATH --language \$Env:LANGUAGE --source-root ."
                } else {
                    codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --source-root .
                }
            } else {
                Write-Output "Build command specified, using '\$Env:BUILD_COMMAND'"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    "\$Env:WORKSPACE\\codeql\\codeql database create \$Env:DATABASE_PATH --language \$Env:LANGUAGE --source-root . --command \$Env:BUILD_COMMAND"
                } else {
                    codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --source-root . --command "\$Env:BUILD_COMMAND"
                }
            }
        } else {
            if ("\$Env:BUILD_COMMAND" -eq "") {
                Write-Output "No build command specified, using default"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    "\$Env:WORKSPACE\\codeql\\codeql database create \$Env:DATABASE_PATH --language \$Env:LANGUAGE --codescanning-config \$Env:CONFIG_FILE --source-root ."
                } else {
                    codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --codescanning-config "\$Env:CONFIG_FILE" --source-root .
                }
            } else {
                Write-Output "Build command specified, using '\$Env:BUILD_COMMAND'"
                if("\$Env:INSTALL_CODEQL" -eq "true") {
                    "\$Env:WORKSPACE\\codeql\\codeql database create \$Env:DATABASE_PATH --language \$Env:LANGUAGE --codescanning-config \$Env:CONFIG_FILE --source-root . --command \$Env:BUILD_COMMAND"
                } else {
                    codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --codescanning-config "\$Env:CONFIG_FILE" --source-root . --command "\$Env:BUILD_COMMAND"
                }
            }
        }
        Write-Output "Database initialized"

        Write-Output "Check if the current directory matches \$Env:WORKSPACE"
        Write-Output "WORKSPACE: \$Env:WORKSPACE."
        Write-Output "Current working directory: \$PWD."
        if (\$Env:WORKSPACE -eq \$PWD) {
            Write-Output "The current directory and \$Env:WORKSPACE match."
            \$Env:CWD = ""
            \$Env:SEP = ""
        } else {
            Write-Output "The current directory and \$Env:WORKSPACE do NOT match."
            \$Env:CWD = "Split-Path \$Env:PWD -Leaf"
            \$Env:SEP = "-"
        }
        Write-Output "Check if the current directory matches \$Env:WORKSPACE"

        Write-Output "Analyzing database"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            "\$Env:WORKSPACE\\codeql\\codeql database analyze --download \$Env:DATABASE_PATH --sarif-category ois-\$Env:LANGUAGE\$Env:SEP\$Env:CWD --format sarif-latest --output \$Env:SARIF_FILE \$Env:QL_PACKS"
        } else {
            codeql database analyze --download "\$Env:DATABASE_PATH" --sarif-category "ois-\$Env:LANGUAGE" --format sarif-latest --output "\$Env:SARIF_FILE" "\$Env:QL_PACKS"
        }
        Write-Output "Database analyzed"
        Write-Output "Generating CSV of results"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            "\$Env:WORKSPACE\\codeql\\codeql database interpret-results \$Env:DATABASE_PATH --format=csv --output=codeql-scan-results-\$Env:LANGUAGE.csv \$Env:QL_PACKS"
        } else {
            codeql database interpret-results "\$Env:DATABASE_PATH" --format=csv --output="codeql-scan-results-\$Env:LANGUAGE.csv" "\$Env:QL_PACKS"
        }
        Write-Output "CSV of results generated"

        if("\$Env:UPLOAD_RESULTS" -eq "true") {
            Write-Output "Uploading SARIF file"
            \$Commit = "\$(git rev-parse HEAD)"
            if("\$Env:INSTALL_CODEQL" -eq "true") {
                "\$Env:WORKSPACE\\codeql\\codeql github upload-results --repository \$Env:ORG/\$Env:REPO  --ref \$Env:REF --commit \$Commit --sarif=\$Env:SARIF_FILE"
            } else {
                codeql github upload-results --repository "\$Env:ORG/\$Env:REPO"  --ref "\$Env:REF" --commit "\$Commit" --sarif="\$Env:SARIF_FILE"
            }
            Write-Output "SARIF file uploaded"
        }

        Write-Output "Generating Database Bundle"
        (\$pwd)
        \$DatabaseBundle = "\$Env:DATABASE_BUNDLE"
        if("\$Env:INSTALL_CODEQL" -eq "true") {
            "\$Env:WORKSPACE\\codeql\\codeql database bundle \$Env:DATABASE_PATH --output \$Env:DATABASE_BUNDLE"
        } else {
            codeql database bundle "\$Env:DATABASE_PATH" --output "\$Env:DATABASE_BUNDLE"
        }
        Write-Output "Database Bundle Generated"
        
        if (Test-Path "\$Env:DATABASE_PATH") {
            dir "\$Env:DATABASE_PATH"
        } else {
            Write-Output "Path NOT here"
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
