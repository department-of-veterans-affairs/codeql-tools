def call(Org, Repo, Branch, Language, BuildCommand, Token) {
    powershell """
        if ("$Branch" -eq "")
        {
            $Branch = "\$((Write-Output \$env:GIT_BRANCH).split('/')[1])"
        }

        Write-Output "Initializing database"
        \$DatabasePath = "$Repo-$Language"
        codeql database create "\$DatabasePath" --language "$Language" --source-root . --command "$BuildCommand"
        Write-Output "Database initialized"

        Write-Output "Analyzing database"
        codeql database analyze --download "\$DatabasePath" --sarif-category "$Language" --format sarif-latest --output "\$DatabasePath.sarif" "codeql/$Language-queries:codeql-suites/$Language-code-scanning.qls"
        Write-Output "Database analyzed"

        Write-Output "Generating CSV of results"
        codeql database interpret-results "\$DatabasePath" --format=csv --output="codeql-scan-results.csv"
        Write-Output "CSV of results generated"


        Write-Output "Uploading SARIF file"
        \$env:GITHUB_TOKEN = "$Token"
        \$Commit = "\$(git rev-parse HEAD)"
        codeql github upload-results --repository "$Org/$Repo"  --ref "refs/heads/$Branch" --commit "\$Commit" --sarif="\$DatabasePath.sarif"
        Write-Output "SARIF file uploaded"

        Write-Output "Generating Database Bundle"
        \$DatabaseBundle = "$Language-database.zip"
        codeql database bundle "\$DatabasePath" --output "\$DatabaseBundle"
        Write-Output "Database Bundle generated"

        Write-Output "Uploading Database Bundle"
        \$Headers = @{
            "Content-Length" = "\$((Get-Item \$DatabaseBundle).Length)"
            "Authorization" = "token $Token"
        }
        Invoke-RestMethod -ContentType 'application/zip' -Headers \$Headers -Method Post -InFile \$DatabaseBundle -Uri "https://uploads.github.com/repos/$Org/$Repo/code-scanning/codeql/databases/$Language?name=\$DatabaseBundle"
        Write-Output "Database Bundle uploaded"
    """
}
