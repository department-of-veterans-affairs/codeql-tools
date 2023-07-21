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
        if (Test-Path -Path "\$Env:WORKSPACE\\codeql\\codeql") {
            "Path exists!"
            "\$Env:WORKSPACE\\codeql\\codeql" --help
        } else {
            "Path doesn't exist."
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
