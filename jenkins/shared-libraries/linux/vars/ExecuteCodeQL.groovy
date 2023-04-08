def call(org, repo, branch, language, buildCommand, token) {
    env.GITHUB_TOKEN = Token
    sh """
        if [[ -z "$branch" ]; then
            # This doesn't work if branch includes a slash in it
            branch=\$(echo "${env.GIT_BRANCH}" | cut -d'/' -f2)
        fi

        echo "Initializing database"
        databasePath="$repo-$language"
        if [[ -z "$buildCommand" ]]; then
            codeql database create "\$databasePath" --language="$language" --source-root . --command="$buildCommand"
        else
            codeql database create "\$databasePath" --language="$language" --source-root .
        fi
        echo "Database initialized"

        echo "Analyzing database"
        codeql database analyze --download "\$databasePath" --sarif-category "$language" --format sarif-latest --output "\$databasePath.sarif" "codeql/$language-queries:codeql-suites/$language-code-scanning.qls"
        echo "Database analyzed"

        echo "Generating CSV of results"
        codeql database interpret-results "\$databasePath" --format=csv --output="codeql-scan-results.csv"
        echo "CSV of results generated"

        echo "Uploading SARIF file"
        commit=\$(git rev-parse HEAD)
        codeql github upload-results \
        --repository="$org/$repo" \
        --ref="refs/heads/$branch" \
        --commit="\$commit" \
        --sarif="\$databasePath.sarif"
        echo "SARIF file uploaded"

        echo "Generating Database Bundle"
        databaseBundle="$language-database.zip"
        codeql database bundle "\$databasePath" --output "\$databaseBundle"
        echo "Database Bundle generated"

        echo "Uploading Database Bundle"
        sizeInBytes=`stat --printf="%s" \$databaseBundle`
        curl --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
        -H "Content-Length: \$sizeInBytes" \
        -H "Authorization: token $token" \
        -T "\$databaseBundle" \
        "https://uploads.github.com/repos/$org/$repo/code-scanning/codeql/databases/$language?name=\$databaseBundle"
        echo "Database Bundle uploaded"
     """
}
