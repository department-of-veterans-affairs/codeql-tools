def call(org, repo, branch, language, buildCommand) {
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
        codeql database interpret-results "\$databasePath" --format=csv --output="$WORKSPACE_TMP/codeql-scan-results.csv"
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
        databaseBundle="$WORKSPACE/$language-database.zip"
        codeql database bundle "\$databasePath" --output "\$databaseBundle"
        echo "Database Bundle generated"
     """

    String databasePath = sprintf("%s/%s-database.zip", env.WORKSPACE, language)
    File file = new File(databasePath)
    String fileContent = file.text
    String authorizationHeader = sprintf("token %s", env.GITHUB_TOKEN)
    String url = sprintf("https://uploads.github.com/repos/%s/%s/code-scanning/codeql/databases/%s?name=%s", org, repo, language, repo, databasePath)
    println("Uploading database bundle")
    def post = new URL(url).openConnection();
    post.setRequestMethod("POST")
    post.setDoOutput(true)
    post.setRequestProperty("Content-Type", "application/zip")
    post.setRequestProperty("Content-Length", file.length().toString())
    post.setRequestProperty("Authorization", authorizationHeader)
    post.getOutputStream().write(fileContent.getBytes("UTF-8"));
    def postRC = post.getResponseCode();
    if(postRC.equals(201)) {
        println(post.getInputStream().getText());
    } else {
        println(post.getErrorStream().getText());
    }
}
