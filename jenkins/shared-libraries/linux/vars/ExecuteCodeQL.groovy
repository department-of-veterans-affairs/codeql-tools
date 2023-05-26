import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.nio.file.Files
import java.nio.file.Paths

def call(org, repo, branch, language, buildCommand, token, installCodeQL) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", token)
    if(branch == "") {
        // TODO: This doesn't work if branch includes a slash in it, split and reform based on branch name
        env.BRANCH = env.GIT_BRANCH.split('/')[1]
    } else {
        env.BRANCH = branch
    }
    env.BUILD_COMMAND = buildCommand
    env.CONFIG_FILE = ".github/codeql-config.yml"
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
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)
    env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-and-quality.qls", language, language)

    sh '''
        if [ "${ENABLE_DEBUG}" = true ]; then
            set -x
        else
            set +x
        fi

        cd "${WORKSPACE}"

        echo "Validating emass.json"
        json_file=".github/emass.json"
        if [ ! -f "$json_file" ]; then
          echo "Error: emass.json not found, please refer to the OIS documentation on creating the emass.json file"
          exit 1
        fi

        output=\$(jq '.' "$json_file" 2> /dev/null)
        if [ $? -ne 0 ]; then
          echo "Error: malformed emass.json file, please refer to the OIS documentation on creating the emass.json file"
          exit 4
        fi

        if [ "${INSTALL_CODEQL}" = false ]; then
            echo "Skipping installation of CodeQL"
        else
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
        fi
    '''

    sh """
        echo "Initializing database"
        if [ ! -f "${config_file}" ]; then
            if [ -z "${BUILD_COMMAND}" ]; then
                echo "No build command, using default"
                if [ "${INSTALL_CODEQL}" = true ]; then
                   ./codeql/codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --source-root .
                else
                    codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --source-root .
                fi
            else
                echo "Build command specified, using '${BUILD_COMMAND}'"
                if [ "${INSTALL_CODEQL}" = true ]; then
                    ./codeql/codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --source-root . --command="${BUILD_COMMAND}"
                else
                    codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --source-root . --command="${BUILD_COMMAND}"
                fi
            fi
        else
            if [ -z "${BUILD_COMMAND}" ]; then
                echo "No build command, using default"
                if [ "${INSTALL_CODEQL}" = true ]; then
                   ./codeql/codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root .
                else
                    codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root .
                fi
            else
                echo "Build command specified, using '${BUILD_COMMAND}'"
                if [ "${INSTALL_CODEQL}" = true ]; then
                    ./codeql/codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root . --command="${BUILD_COMMAND}"
                else
                    codeql database create "${DATABASE_PATH}" --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root . --command="${BUILD_COMMAND}"
                fi
            fi
        fi
        echo "Database initialized"

        echo "Analyzing database"
        if [ "${INSTALL_CODEQL}" = true ]; then
            ./codeql/codeql database analyze "${DATABASE_PATH}" --no-download --sarif-category "ois-${LANGUAGE}" --format sarif-latest --output "${SARIF_FILE}" "${QL_PACKS}"
        else
            codeql database analyze "${DATABASE_PATH}" --no-download --sarif-category "ois-${LANGUAGE}" --format sarif-latest --output "${SARIF_FILE}" "${QL_PACKS}"
        fi
        echo "Database analyzed"

        if [ "${ENABLE_CODEQL_DEBUG}" = true ]; then
            echo "Checking for failed extractions"
            if [ "${INSTALL_CODEQL}" = true ]; then
                ./codeql/codeql bqrs decode "${DATABASE_PATH}/results/codeql/${LANGUAGE}-queries/Diagnostics/ExtractionErrors.bqrs"
            else
                codeql bqrs decode "${DATABASE_PATH}/results/codeql/${LANGUAGE}-queries/Diagnostics/ExtractionErrors.bqrs"
            fi
        fi

        echo "Generating CSV of results"
        if [ "${INSTALL_CODEQL}" = true ]; then
            ./codeql/codeql database interpret-results "${DATABASE_PATH}" --format=csv --output="codeql-scan-results-${LANGUAGE}.csv" "${QL_PACKS}"
        else
            codeql database interpret-results "${DATABASE_PATH}" --format=csv --output="codeql-scan-results-${LANGUAGE}.csv" "${QL_PACKS}"
        fi
        echo "CSV of results generated"

        echo "Uploading SARIF file"
        commit=\$(git rev-parse HEAD)
        if [ "${INSTALL_CODEQL}" = true ]; then
            ./codeql/codeql github upload-results \
            --repository="${ORG}/${REPO}" \
            --ref="refs/heads/${BRANCH}" \
            --commit="\$commit" \
            --sarif="${SARIF_FILE}"
        else
            codeql github upload-results \
            --repository="${ORG}/${REPO}" \
            --ref="refs/heads/${BRANCH}" \
            --commit="\$commit" \
            --sarif="${SARIF_FILE}"
        fi
        echo "SARIF file uploaded"

        echo "Generating Database Bundle"
        if [ "${INSTALL_CODEQL}" = true ]; then
            ./codeql/codeql database bundle "${DATABASE_PATH}" --output "${DATABASE_BUNDLE}"
        else
            codeql database bundle "${DATABASE_PATH}" --output "${DATABASE_BUNDLE}"
        fi
        echo "Database Bundle generated"
    """

    sh '''
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
    '''
}
