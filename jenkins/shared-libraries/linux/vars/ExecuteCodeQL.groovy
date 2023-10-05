def call(org, repo, branch, language, buildCommand, token, installCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(branch == "") {
        env.BRANCH = env.GIT_BRANCH
    } else {
        env.BRANCH = branch
    }
    env.BUILD_COMMAND = buildCommand
    if(!env.CODEQL_RAM) {
        env.CODEQL_RAM_FLAG = ""
    } else {
        env.CODEQL_RAM_FLAG = sprintf("--ram %s", env.CODEQL_RAM.trim())
    }
    if(!env.CODEQL_THREADS) {
        env.CODEQL_THREADS_FLAG = "--threads 0"
    } else {
        env.CODEQL_THREADS_FLAG = sprintf("--threads %s", env.CODEQL_THREADS.trim())
    }
    env.CONFIG_FILE = "${env.WORKSPACE}/.github/codeql-config.yml"
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    if(!env.ENABLE_CODEQL_DEBUG) {
        env.ENABLE_CODEQL_DEBUG = false
    }
    env.GITHUB_TOKEN = token
    if(installCodeQL == true || installCodeQL == "true") {
        env.INSTALL_CODEQL = true
    } else {
        env.INSTALL_CODEQL = false
    }
    env.LANGUAGE = language
    if(env.LANGUAGE == "swift") {
        env.CODEQL_ENABLE_EXPERIMENTAL_FEATURES_SWIFT = true
    }
    env.ORG = org
    env.REPO = repo
    env.REF = sprintf("refs/heads/%s", env.BRANCH)
    if(env.CHANGE_ID) {
        env.REF = sprintf("refs/pull/%s/head", env.CHANGE_ID)
    }
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)
    env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-and-quality.qls", language, language)
    if(!env.UPLOAD_RESULTS) {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "true") {
        env.UPLOAD_RESULTS = true
    } else if(env.UPLOAD_RESULTS && env.UPLOAD_RESULTS == "false") {
        env.UPLOAD_RESULTS = false
    }

    sh '''
        if [ "${ENABLE_DEBUG}" = true ]; then
            set -x
        else
            set +x
        fi

        echo “Current Jenkins Workspace: ${WORKSPACE}”
        echo “Current working directory: ${PWD}”
        echo "CodeQL config file: ${CONFIG_FILE}"
        echo “CodeQL database path: ${DATABASE_PATH}”
        echo “CodeQL database bundle file name: ${DATABASE_BUNDLE}”

        echo "Validating emass.json"
        json_file="${WORKSPACE}/.github/emass.json"
        if [ ! -f "$json_file" ]; then
            echo "Error: emass.json not found, please refer to the OIS documentation on creating the emass.json file"
            exit 1
        fi

        output=\$(jq '.' "$json_file" 2> /dev/null)
        if [ $? -ne 0 ]; then
            echo "Error: malformed emass.json file, please refer to the OIS documentation on creating the emass.json file"
            exit 4
        fi

        systemID=\$(jq -r '.systemID' "$json_file")
        if [ \$systemID -le 0 ] && [ \$systemID -ne -1 ]; then
            echo "Error: systemID '\$systemID' is invalid"
            exit 5
        fi

        systemOwnerEmail=\$(jq -r '.systemOwnerEmail' "$json_file")
        case "\$systemOwnerEmail" in
            *"@"*) echo "Valid eMASS SystemOwnerEmail";;
            *)     echo "Error: systemOwnerEmail '\$systemOwnerEmail' is invalid"; exit 6 ;;
        esac

        if [ "${INSTALL_CODEQL}" = false ]; then
            echo "Skipping installation of CodeQL"
        else
            echo "Installing CodeQL"

            echo "Retrieving latest CodeQL release"
            if [ "${ENABLE_TLS_NO_VERIFY}" = true ]; then
                id=\$(curl --insecure --silent --retry 3 --location \
                --header "${AUTHORIZATION_HEADER}" \
                --header "Accept: application/vnd.github.raw" \
                "https://api.github.com/repos/github/codeql-action/contents/src/defaults.json" | jq -r .bundleVersion)

                echo "Downloading CodeQL version '\$id'"
                curl --insecure --silent --retry 3 --location --output "${WORKSPACE}/codeql.tgz" \
                --header "${AUTHORIZATION_HEADER}" \
                "https://github.com/github/codeql-action/releases/download/\$id/codeql-bundle-linux64.tar.gz"
                tar -xf "${WORKSPACE}/codeql.tgz" --directory "${WORKSPACE}"
                rm "${WORKSPACE}/codeql.tgz"
            else
                id=\$(curl --silent --retry 3 --location \
                --header "${AUTHORIZATION_HEADER}" \
                --header "Accept: application/vnd.github.raw" \
                "https://api.github.com/repos/github/codeql-action/contents/src/defaults.json" | jq -r .bundleVersion)

                echo "Downloading CodeQL version '\$id'"
                curl --silent --retry 3 --location --output "${WORKSPACE}/codeql.tgz" \
                --header "${AUTHORIZATION_HEADER}" \
                "https://github.com/github/codeql-action/releases/download/\$id/codeql-bundle-linux64.tar.gz"
                tar -xf "${WORKSPACE}/codeql.tgz" --directory "${WORKSPACE}"
                rm "${WORKSPACE}/codeql.tgz"
            fi

            echo "CodeQL installed"
        fi
    '''

    sh """
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

        echo "Initializing database"
        if [ ! -f "${CONFIG_FILE}" ]; then
            if [ -z "${BUILD_COMMAND}" ]; then
                echo "No build command, using default"
                "\$command" database create "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --language="${LANGUAGE}" --source-root .
            else
                echo "Build command specified, using '${BUILD_COMMAND}'"
                "\$command" database create "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --language="${LANGUAGE}" --source-root . --command="${BUILD_COMMAND}"
            fi
        else
            if [ -z "${BUILD_COMMAND}" ]; then
                echo "No build command, using default"
                "\$command" database create "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root .
            else
                echo "Build command specified, using '${BUILD_COMMAND}'"
                "\$command" database create "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root . --command="${BUILD_COMMAND}"
            fi
        fi
        echo "Database initialized"

        echo "Checking if current working directory and Jenkins workspace are the same directory"
        if [ "\${PWD}" = "${WORKSPACE}" ]; then
            echo "The current working directory and Jenkins workspace match"
            SUBDIR=''
            SEP=''
        else
            echo "The current working directory and Jenkins workspace do not match, updating the SARIF category value to deduplicate Code Scanning results"
            SUBDIR=\$( echo \${PWD} | awk -F'/' '{print \$NF}' )
            SEP='-'
        fi
        echo "The SARIF category has been configured to ois-${LANGUAGE}\${SEP}\${SUBDIR}"

        echo "Analyzing database"
        "\$command" database analyze "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --no-download --sarif-category "ois-${LANGUAGE}\${SEP}\${SUBDIR}" --format sarif-latest --output "${SARIF_FILE}" "${QL_PACKS}"
        echo "Database analyzed"

        if [ "${ENABLE_CODEQL_DEBUG}" = true ]; then
            echo "Checking for failed extractions"
            "\$command" bqrs decode "${DATABASE_PATH}/results/codeql/${LANGUAGE}-queries/Diagnostics/ExtractionErrors.bqrs"
        fi

        echo "Generating CSV of results"
        "\$command" database interpret-results "${DATABASE_PATH}" ${CODEQL_THREADS_FLAG} --format=csv --output="codeql-scan-results-${LANGUAGE}.csv" "${QL_PACKS}"
        echo "CSV of results generated"

        if [ "${UPLOAD_RESULTS}" = true ]; then
            echo "Uploading SARIF file"
            commit=\$(git rev-parse HEAD)
            "\$command" github upload-results \
            --repository="${ORG}/${REPO}" \
            --ref="${REF}" \
            --commit="\$commit" \
            --sarif="${SARIF_FILE}"
            echo "SARIF file uploaded"
        fi

        echo "Generating Database Bundle"
        "\$command" database bundle "${DATABASE_PATH}" --output "${DATABASE_BUNDLE}"
        echo "Database Bundle generated"
    """

    sh '''
        if [ "${ENABLE_DEBUG}" = true ]; then
            set -x
        else
            set +x
        fi

        if [ "${UPLOAD_RESULTS}" = true ]; then
            echo "Uploading Database Bundle"
            sizeInBytes=`stat --printf="%s" ${DATABASE_BUNDLE}`
            if [ "${ENABLE_TLS_NO_VERIFY}" = true ]; then
                curl --insecure --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
                -H "Content-Length: \$sizeInBytes" \
                -H "${AUTHORIZATION_HEADER}" \
                -T "${DATABASE_BUNDLE}" \
                "https://uploads.github.com/repos/$ORG/$REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
            else
                curl --http1.0 --silent --retry 3 -X POST -H "Content-Type: application/zip" \
                -H "Content-Length: \$sizeInBytes" \
                -H "${AUTHORIZATION_HEADER}" \
                -T "${DATABASE_BUNDLE}" \
                "https://uploads.github.com/repos/$ORG/$REPO/code-scanning/codeql/databases/${LANGUAGE}?name=${DATABASE_BUNDLE}"
            fi
            echo "Database Bundle uploaded"
        fi
    '''
}
