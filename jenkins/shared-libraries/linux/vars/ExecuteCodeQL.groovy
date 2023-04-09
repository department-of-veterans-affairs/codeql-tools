def call(org, repo, branch, language, buildCommand, token, installCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(branch == "") {
        // TODO: This doesn't work if branch includes a slash in it, split and reform based on branch name
        env.BRANCH = env.GIT_BRANCH.split('/')[1]
    } else {
        env.BRANCH = branch
    }
    env.BUILD_COMMAND = buildCommand
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    env.GITHUB_TOKEN = token
    if(installCodeQL == true || installCodeQL == "true") {
        env.PATH = sprintf("%s/codeql:%s", env.WORKSPACE, env.PATH)
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = language
    env.ORG = org
    env.REPO = repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)

    sh """
        # set +x

        if [ $INSTALL_CODEQL == false ]; then
            echo "Skipping installation of CodeQL"
        else
            echo "Installing CodeQL"

            echo "Retrieving latest CodeQL release"
            id=\$(curl --silent --retry 3 --location \
            --header "$AUTHORIZATION_HEADER" \
            --header "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/github/codeql-action/releases/latest" | jq -r .tag_name)

            echo "Downloading CodeQL bundle for version '\$id'"
            curl --silent --retry 3 --location --output codeql.tgz \
            "https://github.com/github/codeql-action/releases/download/\$id/codeql-bundle-linux64.tar.gz"

            echo "Extracting CodeQL bundle"
            tar -xzf codeql.tgz --directory "$WORKSPACE"

            echo "Removing CodeQL bundle tarball"
            rm codeql.tgz

            echo "CodeQL installed"
        fi
    """

    sh """
        set +x
        which codeql
        echo "Initializing database"
        if [ -z "$BUILD_COMMAND" ]; then
            echo "No build command, using default"
            codeql database create "$DATABASE_PATH" --language="$LANGUAGE" --source-root .
        else
            echo "Build command specified, using '$BUILD_COMMAND'"
            codeql database create "$DATABASE_PATH" --language="$LANGUAGE" --source-root . --command="$BUILD_COMMAND"
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
        set +x

        echo "Uploading Database Bundle"
        sizeInBytes=`stat --printf="%s" ${DATABASE_BUNDLE}`
        curl --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
        -H "Content-Length: \$sizeInBytes" \
        -H "${AUTHORIZATION_HEADER}" \
        -T "${DATABASE_BUNDLE}" \
        "https://uploads.github.com/repos/$ORG/$REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
        echo "Database Bundle uploaded"
    '''
}
