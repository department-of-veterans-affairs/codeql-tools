def call(repo, language) {
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
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", language)
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    if(!env.ENABLE_CODEQL_DEBUG) {
        env.ENABLE_CODEQL_DEBUG = false
    }
    env.LANGUAGE = language.toLowerCase()
    if(["javascript" , "python", "ruby", "go"].contains(env.LANGUAGE)) {
        env.COMPILED_LANGUAGE = false
    } else {
        env.COMPILED_LANGUAGE = true
    }
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)
    env.QL_PACKS = sprintf("codeql/%s-queries:codeql-suites/%s-security-and-quality.qls", language, language)

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

        if [ "${BUILD_COMMAND}" = "" ] && [ "${COMPILED_LANGUAGE}" = true ]; then
            echo "Finalizing database"
            "\$command" database finalize "${DATABASE_PATH}"
            echo "Database finalized"
        fi

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
        "\$command" database analyze "${DATABASE_PATH}" --no-download ${CODEQL_THREADS_FLAG} ${CODEQL_RAM_FLAG} --sarif-category "ois-${LANGUAGE}\${SEP}\${SUBDIR}" --format sarif-latest --output "${SARIF_FILE}" "${QL_PACKS}"
        echo "Database analyzed"

        if [ "${ENABLE_CODEQL_DEBUG}" = true ]; then
            echo "Checking for failed extractions"
            "\$command" bqrs decode "${DATABASE_PATH}/results/codeql/${LANGUAGE}-queries/Diagnostics/ExtractionErrors.bqrs"
        fi

        echo "Generating CSV of results"
        "\$command" database interpret-results "${DATABASE_PATH}" --format=csv --output="codeql-scan-results-${LANGUAGE}.csv" "${QL_PACKS}"
        echo "CSV of results generated"

        echo "Generating Database Bundle"
        "\$command" database bundle "${DATABASE_PATH}" --output "${DATABASE_BUNDLE}"
        echo "Database Bundle generated"
    """
}
