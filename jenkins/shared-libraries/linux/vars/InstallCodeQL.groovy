def call(token) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    env.GITHUB_TOKEN = token

    sh '''
        if [ "${ENABLE_DEBUG}" = true ]; then
            set -x
        else
            set +x
        fi

        echo "Installing CodeQL"

        echo "Retrieving latest CodeQL release"
        if [ "${ENABLE_TLS_NO_VERIFY}" = true ]; then
            id=\$(curl --insecure --silent --retry 3 --location \
            --header "${AUTHORIZATION_HEADER}" \
            --header "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/github/codeql-action/releases/latest" | jq -r .tag_name)

            echo "Downloading CodeQL version '\$id'"
            curl --insecure --silent --retry 3 --location --output "${WORKSPACE}/codeql.tgz" \
            --header "${AUTHORIZATION_HEADER}" \
            "https://github.com/github/codeql-action/releases/download/\$id/codeql-bundle-linux64.tar.gz"
            tar -xf "${WORKSPACE}/codeql.tgz" --directory "${WORKSPACE}"
            rm "${WORKSPACE}/codeql.tgz"
        else
            id=\$(curl --silent --retry 3 --location \
            --header "${AUTHORIZATION_HEADER}" \
            --header "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/github/codeql-action/releases/latest" | jq -r .tag_name)

            echo "Downloading CodeQL version '\$id'"
            curl --silent --retry 3 --location --output "${WORKSPACE}/codeql.tgz" \
            --header "${AUTHORIZATION_HEADER}" \
            "https://github.com/github/codeql-action/releases/download/\$id/codeql-bundle-linux64.tar.gz"
            tar -xf "${WORKSPACE}/codeql.tgz" --directory "${WORKSPACE}"
            rm "${WORKSPACE}/codeql.tgz"
        fi

        echo "CodeQL installed"
    '''
}
