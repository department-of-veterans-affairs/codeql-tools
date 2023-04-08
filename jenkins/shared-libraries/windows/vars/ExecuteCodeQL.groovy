def call(Org, Repo, Branch, Language, BuildCommand, Token) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", Token)
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
    env.LANGUAGE = Language
    env.ORG = Org
    env.REPO = Repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", Repo, Language)

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
        Invoke-RestMethod -ContentType "application/zip" -Headers \$Headers -Method Post -InFile "\$Env:DATABASE_BUNDLE" -Uri "https://uploads.github.com/repos/\$Env:ORG/\$Env:REPO/code-scanning/codeql/databases/\$(\$Env:LANGUAGE)?name=\$Env:DATABASE_BUNDLE"
        Write-Output "Database Bundle uploaded"
    """

}
