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
            codeql database create "\$Env:DATABASE_PATH" --language "\$Env:Language" --source-root .
        } else {
            codeql database create "\$Env:DATABASE_PATH" --language "\$Env:Language" --source-root . --command "\$Env:BUILD_COMMAND"
        }
        Write-Output "Database initialized"

        Write-Output "Analyzing database"
        codeql database analyze --download "\$Env:DATABASE_PATH" --sarif-category "\$Env:Language" --format sarif-latest --output "\$Env:SARIF_FILE" "codeql/\$Env:Language-queries:codeql-suites/\$Env:Language-code-scanning.qls"
        Write-Output "Database analyzed"

        Write-Output "Generating CSV of results"
        codeql database interpret-results "\$Env:DATABASE_PATH" --format=csv --output="codeql-scan-results.csv"
        Write-Output "CSV of results generated"

        Write-Output "Uploading SARIF file"
        \$Commit = "\$(git rev-parse HEAD)"
        codeql github upload-results --repository "\$Env:Org/\$Env:Repo"  --ref "refs/heads/\$Env:Branch" --commit "\$Commit" --sarif="\$Env:SARIF_FILE"
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
        Invoke-RestMethod -ContentType 'application/zip' -Headers \$Headers -Method Post -InFile "\$Env:DATABASE_BUNDLE" -Uri "https://uploads.github.com/repos/\$Env:Org/\$Env:Repo/code-scanning/codeql/databases/\$Env:Language?name=\$Env:DATABASE_BUNDLE"
        Write-Output "Database Bundle uploaded"
    """

}
