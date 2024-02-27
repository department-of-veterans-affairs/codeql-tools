def call(org, repo, branch, language, token) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(branch == "") {
        env.CT_BRANCH = env.GIT_CT_BRANCH
    } else {
        env.CT_BRANCH = branch
    }
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    env.GITHUB_TOKEN = token
    env.LANGUAGE = language
    env.CT_ORG = org
    env.CT_REPO = repo
    env.CT_REF = sprintf("refs/heads/%s", env.CT_BRANCH)
    if(env.CHANGE_ID) {
        env.CT_REF = sprintf("refs/pull/%s/head", env.CHANGE_ID)
    }

    sh '''
        if [ "${ENABLE_DEBUG}" = true ]; then
            set -x
        else
            set +x
        fi

        command="codeql"
        if [ ! -x "\$(command -v \$command)" ]; then
            echo "CodeQL CLI not found on PATH, checking if local copy exists"
            if [ ! -f "${WORKSPACE}/codeql/codeql" ]; then
                echo "CodeQL CLI not found in local copy, please add the CodeQL CLI to your PATH or use the 'InstallCodeQL' command to download it"
                exit 1
            fi
            echo "Using local copy of CodeQL CLI"
            command="${WORKSPACE}/codeql/codeql"
        fi

        echo "Uploading SARIF file"
        commit=\$(git rev-parse HEAD)
        "\$command" github upload-results \
        --repository="${CT_ORG}/${CT_REPO}" \
        --ref="${CT_REF}" \
        --commit="\$commit" \
        --sarif="${SARIF_FILE}"
        echo "SARIF file uploaded"

        echo "Uploading Database Bundle"
        sizeInBytes=`stat --printf="%s" ${DATABASE_BUNDLE}`
        if [ "${ENABLE_TLS_NO_VERIFY}" = true ]; then
            curl --insecure --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
            -H "Content-Length: \$sizeInBytes" \
            -H "${AUTHORIZATION_HEADER}" \
            -T "${DATABASE_BUNDLE}" \
            "https://uploads.github.com/repos/$CT_ORG/$CT_REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
        else
            curl --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
            -H "Content-Length: \$sizeInBytes" \
            -H "${AUTHORIZATION_HEADER}" \
            -T "${DATABASE_BUNDLE}" \
            "https://uploads.github.com/repos/$CT_ORG/$CT_REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
        fi
        echo "Database Bundle uploaded"
    '''
}
