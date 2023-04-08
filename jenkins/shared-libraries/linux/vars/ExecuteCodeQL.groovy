def call(org, repo, branch, language, buildCommand, token) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    env.BRANCH = branch
    env.BUILD_COMMAND = buildCommand
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    env.GITHUB_TOKEN = token
    env.LANGUAGE = language
    env.ORG = org
    env.REPO = repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)


    sh """
        if [[ -z "$BRANCH" ]; then
            # This doesn't work if branch includes a slash in it
            branch=\$(echo "${env.GIT_BRANCH}" | cut -d'/' -f2)
        fi

        echo "Initializing database"
        if [[ -z "$BUILD_COMMAND" ]]; then
            codeql database create "$DATABASE_PATH" --language="$LANGUAGE" --source-root . --command="$BUILD_COMMAND"
        else
            codeql database create "$DATABASE_PATH" --language="$LANGUAGE" --source-root .
        fi
        echo "Database initialized"

        echo "Analyzing database"
        codeql database analyze --download "$DATABASE_PATH" --sarif-category "$LANGUAGE" --format sarif-latest --output "$SARIF_FILE" "codeql/$LANGUAGE-queries:codeql-suites/$LANGUAGE-code-scanning.qls"
        echo "Database analyzed"

        echo "Generating CSV of results"
        codeql database interpret-results "$DATABASE_PATH" --format=csv --output="codeql-scan-results.csv"
        echo "CSV of results generated"

        echo "Uploading SARIF file"
        commit=\$(git rev-parse HEAD)
        codeql github upload-results \
        --repository="$ORG/$REPO" \
        --ref="refs/heads/$BRANCH" \
        --commit="\$commit" \
        --sarif="$SARIF_FILE"
        echo "SARIF file uploaded"

        echo "Generating Database Bundle"
        codeql database bundle "$DATABASE_PATH" --output "$DATABASE_BUNDLE"
        echo "Database Bundle generated"
     """

    sh '''
        echo "Uploading Database Bundle"
        sizeInBytes=`stat --printf="%s" ${DATABASE_BUNDLE}`
        curl --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
        -H "Content-Length: \$sizeInBytes" \
        -H "${AUTHORIZATION_HEADER}" \
        -T "${DATABASE_BUNDLE}" \
        "https://uploads.github.com/repos/$ORG/$REPO/code-scanning/codeql/databases/$LANGUAGE?name=${DATABASE_BUNDLE}"
        echo "Database Bundle uploaded"
    '''
}
