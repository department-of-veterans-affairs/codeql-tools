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
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = language
    env.ORG = org
    env.REPO = repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)

    sh '''
        set +x

        if [ "${INSTALL_CODEQL}" = false ]; then
            echo "Skipping installation of CodeQL"
        else
            echo "Installing CodeQL"

            echo "Retrieving CodeQL query packs"
            curl -k --silent --retry 3 --location --output codeql-queries.tgz \
            "https://github.com/github/codeql-action/releases/download/codeql-bundle-20230403/codeql-bundle-linux64.tar.gz"
            tar -xf codeql-queries.tgz
            rm codeql-queries.tgz
            mv codeql codeql-queries

            echo "Downloading CodeQL archive for version 'v2.12.7'"
            curl -k --silent --retry 3 --location --output codeql.zip \
            "https://github.com/github/codeql-cli-binaries/releases/download/v2.12.7/codeql-linux64.zip"

            echo "Extracting CodeQL archive"
            unzip -qq codeql.zip -d "${WORKSPACE}"

            echo "Removing CodeQL archive"
            rm codeql.zip

            echo "CodeQL installed"
        fi
    '''

    sh """
        set +x

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
        codeql database analyze "$DATABASE_PATH" --no-download --sarif-category "$LANGUAGE" --format sarif-latest --output "$SARIF_FILE" --search-path="codeql-queries" "codeql/$LANGUAGE-queries:codeql-suites/$LANGUAGE-security-extended.qls"
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
        curl -k --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
        -H "Content-Length: \$sizeInBytes" \
        -H "${AUTHORIZATION_HEADER}" \
        -T "${DATABASE_BUNDLE}" \
        "https://uploads.github.com/repos/$ORG/$REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
        echo "Database Bundle uploaded"
    '''
}
