def call(Org, Repo, Branch, Language, BuildCommand, Token, InstallCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("token %s", Token)
    if(Branch == "") {
        // TODO: This doesn't work if branch includes a slash in it, split and reform based on branch name
        env.BRANCH = env.GIT_BRANCH.split('/')[1]
    } else {
        env.BRANCH = Branch
    }
    env.BUILD_COMMAND = BuildCommand
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", Language)
    env.DATABASE_PATH = sprintf("%s-%s", Repo, Language)
    env.GITHUB_TOKEN = Token
    if(InstallCodeQL == true || InstallCodeQL == "true") {
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = Language
    env.ORG = Org
    env.REPO = Repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", Repo, Language)
    env.UPLOAD_URL = sprintf("https://uploads.github.com/repos/%s/%s/code-scanning/codeql/databases/%s?name=%s", Org, Repo, Language, env.DATABASE_BUNDLE)

    powershell """
        if("$Env:INSTALL_CODEQL" -eq "false") {
            Write-Output "Skipping installation of CodeQL"
        } else {
            Write-Output "Installing CodeQL"

            Write-Output "Retrieving latest CodeQL release"
            \$Headers = @{
                "Authorization" = "\$Env:AUTHORIZATION_HEADER"
                "Accept" = "application/vnd.github+json"
            }
            \$Request = Invoke-WebRequest -UseBasicParsing -Method Get -Headers  \$Headers -Uri "https://api.github.com/repos/github/codeql-cli-binaries/releases/latest"
            \$Json = \$Request.Content | ConvertFrom-Json
            \$Id = \$Json.tag_name

            Write-Output "Downloading CodeQL archive for version '\$Id'"
            \$ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Method Get -OutFile "codeql-bundle.zip" -Uri "https://github.com/github/codeql-cli-binaries/releases/download/\$Id/codeql-win64.zip"
            \$ProgressPreference = 'Continue'

            Write-Output "Extracting CodeQL archive"
            Expand-Archive -Path "codeql-bundle.zip" -DestinationPath "\$Env:WORKSPACE"

            Write-Output "Removing CodeQL bundle archive"
            Remove-Item "\$Env:WORKSPACE\\codeql-bundle.zip"

            Write-Output "CodeQL installed"
        }
    """

    powershell """
        Write-Output "Initializing database"
        if ("\$Env:BUILD_COMMAND" -eq "") {
            Write-Output "No build command specified, using default"
            codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --source-root .
        } else {
            Write-Output "Build command specified, using '\$Env:BUILD_COMMAND'"
            codeql database create "\$Env:DATABASE_PATH" --language "\$Env:LANGUAGE" --source-root . --command "\$Env:BUILD_COMMAND"
        }
        Write-Output "Database initialized"

        Write-Output "Analyzing database"
        codeql database analyze --download "\$Env:DATABASE_PATH" --sarif-category "\$Env:LANGUAGE" --format sarif-latest --output "\$Env:SARIF_FILE" "codeql/\$Env:LANGUAGE-queries:codeql-suites/\$Env:LANGUAGE-code-scanning.qls"
        Write-Output "Database analyzed"

        Write-Output "Generating CSV of results"
        codeql database interpret-results "\$Env:DATABASE_PATH" --format=csv --output="codeql-scan-results.csv"
        Write-Output "CSV of results generated"

        Write-Output "Uploading SARIF file"
        \$Commit = "\$(git rev-parse HEAD)"
        codeql github upload-results --repository "\$Env:ORG/\$Env:REPO"  --ref "refs/heads/\$Env:BRANCH" --commit "\$Commit" --sarif="\$Env:SARIF_FILE"
        Write-Output "SARIF file uploaded"

        Write-Output "Generating Database Bundle"
        \$DatabaseBundle = "\$Env:DATABASE_BUNDLE"
        codeql database bundle "\$Env:DATABASE_PATH" --output "\$Env:DATABASE_BUNDLE"
        Write-Output "Database Bundle generated"

        Write-Output "Uploading Database Bundle"
        \$Headers = @{
            "Content-Length" = "\$((Get-Item \$Env:DATABASE_BUNDLE).Length)"
            "Authorization" = "\$Env:AUTHORIZATION_HEADER"
        }
        Invoke-RestMethod -ContentType "application/zip" -Headers \$Headers -Method Post -InFile "\$Env:DATABASE_BUNDLE" -Uri "\$Env:UPLOAD_URL"
        Write-Output "Database Bundle uploaded"
    """
}
