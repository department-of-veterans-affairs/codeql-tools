def call(repo, language, buildCommand) {
    env.BUILD_COMMAND = buildCommand
    env.CONFIG_FILE = "${env.WORKSPACE}/.github/codeql-config.yml"
    env.DATABASE_PATH = sprintf("%s-%s", repo, language)
    if(!env.ENABLE_DEBUG) {
        env.ENABLE_DEBUG = false
    }
    env.LANGUAGE = language
    if(env.LANGUAGE != "javascript" && env.LANGUAGE != "python" && env.LANGUAGE != "ruby") {
        env.COMPILED_LANGUAGE = true
    } else {
        env.COMPILED_LANGUAGE = false
    }

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
        if [ "${BUILD_COMMAND}" != "" ]; then
            echo "Invoking build command: ${BUILD_COMMAND}"
            if [ ! -f "${CONFIG_FILE}" ]; then
                "\$command" database create "${DATABASE_PATH}" --threads 0 --language="${LANGUAGE}" --source-root . --command="${BUILD_COMMAND}"
            else
                "\$command" database create "${DATABASE_PATH}" --threads 0 --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root . --command="${BUILD_COMMAND}"
            fi
        elif [ "${COMPILED_LANGUAGE}" = "false" ]; then
            echo "Invoking auto-builder for non-compiled language"
            if [ ! -f "${CONFIG_FILE}" ]; then
                "\$command" database create "${DATABASE_PATH}" --threads 0 --language="${LANGUAGE}" --source-root .
            else
                "\$command" database create "${DATABASE_PATH}" --threads 0 --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root .
            fi
        else
            echo "Invoking build-tracing for compiled language"
            if [ ! -f "${CONFIG_FILE}" ]; then
                "\$command" database init "${DATABASE_PATH}" --language="${LANGUAGE}" --source-root . --begin-tracing
            else
                "\$command" database init "${DATABASE_PATH}" --language="${LANGUAGE}" --codescanning-config "${CONFIG_FILE}" --source-root . --begin-tracing
            fi
        fi
        echo "Database initialized"
    """
}
