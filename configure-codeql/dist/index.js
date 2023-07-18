/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 304:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const core = __nccwpck_require__(385)

/**
 * Parse the input from the workflow file
 * @returns {{configure_codeql_privateKey: string, verify_scans_id: number, org: string, configure_codeql_installationID: number, verify_scans_privateKey: string, repo: string, configure_codeql_id: number, verify_scans_installationID: number, admin_token: string, pull_request_body: string}}
 *
 * @throws {Error} - Throws an error if the input is invalid
 */
exports.parseInput = () => {
    try {
        const admin_token = core.getInput('admin_token', {
            required: true, trimWhitespace: true
        })
        const configure_codeql_id = Number(core.getInput('ghas_configure_codeql_app_id', {
            required: true, trimWhitespace: true
        }))
        const configure_codeql_privateKey = core.getInput('ghas_configure_codeql_private_key', {
            required: true, trimWhitespace: true
        })
        const configure_codeql_installationID = Number(core.getInput('ghas_configure_codeql_installation_id', {
            required: true, trimWhitespace: true
        }))
        const org = core.getInput('org', {
            required: true, trimWhitespace: true
        })
        const pull_request_body = core.getInput('pull_request_body', {
            required: true, trimWhitespace: true
        })
        const repo = core.getInput('repo', {
            required: false, trimWhitespace: true
        })
        const verify_scans_id = Number(core.getInput('ghas_verify_scans_app_id', {
            required: true, trimWhitespace: true
        }))
        const verify_scans_private_key = core.getInput('ghas_verify_scans_private_key', {
            required: true, trimWhitespace: true
        })
        const verify_scans_installationID = Number(core.getInput('ghas_verify_scans_installation_id', {
            required: true, trimWhitespace: true
        }))

        return {
            org: org,
            admin_token: admin_token,
            configure_codeql_id: configure_codeql_id,
            configure_codeql_privateKey: configure_codeql_privateKey,
            configure_codeql_installationID: configure_codeql_installationID,
            pull_request_body: pull_request_body,
            repo: repo,
            verify_scans_id: verify_scans_id,
            verify_scans_privateKey: verify_scans_private_key,
            verify_scans_installationID: verify_scans_installationID
        }
    } catch (e) {
        core.setFailed(`Failed to parse input: ${e.message}`)
        process.exit(1)
    }
}


/***/ }),

/***/ 527:
/***/ ((__unused_webpack_module, exports) => {

const DRY_RUN = process.env.DRY_RUN && process.env.DRY_RUN.toLowerCase() === 'true'

/**
 * Create a new branch in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param sha - The sha of the commit to branch from
 * @param branch - The name of the new branch
 * @returns {Promise<void>} - A promise which resolves when the branch has been created
 *
 * @throws {Error} - If the branch could not be created
 */
exports.createRef = async (octokit, owner, repo, sha, branch) => {
    try {
        if (!DRY_RUN) {
            console.log(`Creating branch ${branch} in ${owner}/${repo} with sha ${sha}...`)
            // https://docs.github.com/en/enterprise-cloud@latest/rest/git/refs?apiVersion=2022-11-28#create-a-reference
            await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                owner: owner,
                repo: repo,
                ref: `refs/heads/${branch}`,
                sha: sha
            })
        }
    } catch (e) {
        throw new Error(`Failed to create ref: ${e.message}`)
    }
}

/**
 * Create a new file in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param branch - The branch to create the file in
 * @param path - The path of the file to create
 * @param message - The commit message
 * @param content - The content of the file
 * @returns {Promise<void>} - A promise which resolves when the file has been created
 *
 * @throws {Error} - If the file could not be created
 */
exports.createFile = async (octokit, owner, repo, branch, path, message, content) => {
    try {
        if (!DRY_RUN) {
            // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: owner,
                repo: repo,
                path: path,
                message: message,
                content: Buffer.from(content).toString('base64'),
                branch: branch,
                name: 'ghas-configure-codeql[bot]',
                email: '41898282+ghas-configure-codeql[bot]@users.noreply.github.com'
            })
        }
    } catch (e) {
        throw new Error(`Failed to create file: ${e.message}`)
    }
}

/**
 * Create a new pull request in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param title - The title of the pull request
 * @param head - The branch to merge from
 * @param base - The branch to merge into
 * @param body - The body of the pull request
 * @returns {Promise<void>} - A promise which resolves when the pull request has been created
 *
 * @throws {Error} - If the pull request could not be created
 */
exports.createPullRequest = async (octokit, owner, repo, title, head, base, body) => {
    try {
        if (!DRY_RUN) {
            // https://docs.github.com/en/enterprise-cloud@latest/rest/pulls/pulls?apiVersion=2022-11-28#create-a-pull-request
            await octokit.request('POST /repos/{owner}/{repo}/pulls',{
                owner: owner,
                repo: repo,
                title: title,
                head: head,
                base: base,
                body: body
            })
        }
    } catch (e) {
        throw new Error(`Failed to create pull request: ${e.message}`)
    }
}


/***/ }),

/***/ 938:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const {supportedCodeQLLanguages} = __nccwpck_require__(816)

/**
 * Check if a repository is already configured for CodeQL
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @returns {Promise<{workflow: string, enabled: boolean}|boolean>} - A promise which resolves to false if the repository is not configured for CodeQL, or an object containing the workflow name and whether it is enabled
 *
 * @throws {Error} - If the repository could not be checked
 */
exports.getCodeQLStatus = async (octokit, owner, repo) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/code-scanning?apiVersion=2022-11-28#list-code-scanning-analyses-for-a-repository
        const {data: analyses} = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/analyses', {
            owner: owner,
            repo: repo,
            tool_name: 'CodeQL',
            per_page: 1
        })
        if (analyses.length === 0) {
            return false
        }

        return {
            enabled: analyses.length > 0,
            workflow: analyses[0].analysis_key.split(':')[0]
        }
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw e
    }
}

/**
 * Retrieves the current sha of the default branch
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param branch - The name of the default branch
 * @returns {Promise<string>} - A promise which resolves to the sha of the default branch
 *
 * @throws {Error} - If the default branch could not be retrieved
 */
exports.getDefaultRefSHA = async (octokit, owner, repo, branch) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/git/refs?apiVersion=2022-11-28#get-a-reference
        const {data: ref} = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner: owner,
            repo: repo,
            ref: `heads/${branch}`
        })

        return ref.object.sha
    } catch (e) {
        throw new Error(`Failed to retrieve default branch SHA: ${e.message}`)
    }
}

/**
 * Retrieves the current sha of a file in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param branch - The name of the branch
 * @param path - The path of the file
 * @returns {Promise<string>} - A promise which resolves to the sha of the file
 *
 * @throws {Error} - If the file could not be retrieved
 */
exports.getFileRefSHA = async (octokit, owner, repo, branch, path) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#get-repository-content
        const {data: content} = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })

        return content.sha
    } catch (e) {
        if (e.status === 404) {
            throw new Error(`File not found: ${path}`)
        }

        throw new Error(`Failed to retrieve file SHA: ${e.message}`)
    }
}

/**
 * Retrieves the repository's the app is installed on
 * @param octokit - An authenticated octokit client
 * @returns {Promise<string[]>} - A promise which resolves to an array of repository names
 *
 * @throws {Error} - If the repositories could not be retrieved
 */
exports.getInstalledRepos = async (octokit) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/apps/installations?apiVersion=2022-11-28#list-repositories-accessible-to-the-app-installation
        const repos = await octokit.paginate('GET /installation/repositories', {
            per_page: 100
        })

        return repos.map(repo => repo.name)
    } catch (e) {
        throw new Error(`Failed to list installed repositories: ${e.message}`)
    }
}

/**
 * Retrieves a list of languages contained in the repository that are supported by CodeQL
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @returns {Promise<string[]>} - A promise which resolves to an array of languages
 *
 * @throws {Error} - If the languages could not be retrieved
 */
exports.getSupportedCodeQLLanguages = async (octokit, owner, repo) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/repos?apiVersion=2022-11-28#list-repository-languages
        const {data: languages} = await octokit.request('GET /repos/{owner}/{repo}/languages', {
            owner: owner,
            repo: repo
        })

        return Object.keys(languages).map(language => language.toLowerCase()).filter(language => supportedCodeQLLanguages.includes(language))
    } catch (e) {
        throw new Error(`Failed to retrieve supported CodeQL languages: ${e.message}`)
    }
}


/***/ }),

/***/ 219:
/***/ ((__unused_webpack_module, exports) => {

const DRY_RUN = process.env.DRY_RUN && process.env.DRY_RUN.toLowerCase() === 'true'

/**
 * Update an existing file in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param branch - The branch to update
 * @param path - The path of the file to update
 * @param message - The commit message
 * @param content - The new content of the file
 * @param sha - The current SHA of the file to update
 * @returns {Promise<void>} - A promise which resolves when the file has been updated
 *
 * @throws {Error} - If the file could not be updated
 */
exports.updateFile = async (octokit, owner, repo, branch, path, message, content, sha) => {
    try {
        if (!DRY_RUN) {
            // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}',{
                owner: owner,
                repo: repo,
                path: path,
                message: message,
                content: Buffer.from(content).toString('base64'),
                sha: sha,
                branch: branch
            })
        }
    } catch (e) {
        throw new Error(`Failed to update file: ${e.message}`)
    }
}


/***/ }),

/***/ 120:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const core = __nccwpck_require__(385)
const {
    fileExistsOnDefaultBranch,
    defaultCodeScanningEnabled,
    reusableWorkflowInUse,
    installVerifyScansApp,
    mapLanguages,
    generateCodeQLWorkflow,
    generateEMASSJson,
    refExists,
    fileExistsOnBranch,
    generatePullRequestBody
} = __nccwpck_require__(747)
const {getCodeQLStatus, getSupportedCodeQLLanguages, getDefaultRefSHA, getFileRefSHA} = __nccwpck_require__(938)
const {createRef, createFile, createPullRequest} = __nccwpck_require__(527)
const {updateFile} = __nccwpck_require__(219)

const PULL_REQUEST_TITLE = 'Action Required: Configure CodeQL'
const SOURCE_BRANCH_NAME = 'ghas-enforcement-codeql'

/**
 * Manages the configuration of CodeQL for a repository
 */
class Manager {
    constructor(adminClient, config, verifyScansInstalledRepositories) {
        this.adminClient = adminClient
        this.config = config
        this.verifyScansInstalledRepositories = verifyScansInstalledRepositories
    }

    /**
     * Processes a repository to configure CodeQL
     * @param octokit - GitHub App installation client
     * @param repository - Repository to configure as returned by the `GET /repos/{owner}/{repo}` endpoint
     * @returns {Promise<void>} - Promise that resolves when the repository has been configured
     */
    processRepository = async (octokit, repository) => {
        try {
            core.info(`[${repository.name}]: Checking if repository is archived`)
            if (repository.archived) {
                core.info(`[${repository.name}]: [skipped-archived] Skipping repository as it is archived`)
                return
            }

            core.info(`[${repository.name}]: Processing repository`)
            if (this.verifyScansInstalledRepositories.includes(repository.name)) {
                core.info(`[${repository.name}]: [skipped-already-configured] Skipping repository as it is has already been configured via the Configure CodeQL GitHub App Pull Request`)
                return
            }

            core.info(`[${repository.name}]: Retrieving .emass-repo-ignore file`)
            const emassIgnore = await fileExistsOnDefaultBranch(octokit, repository.owner.login, repository.name, '.github/.emass-repo-ignore')
            if (emassIgnore) {
                core.info(`[${repository.name}]: [skipped-ignored] Found .emass-repo-ignore file, skipping repository`)
                return
            }

            core.info(`[${repository.name}]: Checking if repository has Code Scanning enabled`)
            // TODO: Figure out what app permission grants the `security_event` permission
            const codeScanningConfig = await getCodeQLStatus(this.adminClient, repository.owner.login, repository.name)
            if (codeScanningConfig.enabled) {
                core.info(`[${repository.name}]: Validating repository is not using default code scanning configuration`)
                const defaultConfig = await defaultCodeScanningEnabled(this.adminClient, repository.owner.login, repository.name)
                if (defaultConfig) {
                    core.info(`[${repository.name}]: Repository has Default Code Scanning enabled, executing configuration`)
                } else {
                    core.info(`[${repository.name}]: Validating reusable workflow in use`)
                    const reusableWorkflowUsed = await reusableWorkflowInUse(octokit, repository.owner.login, repository.name, repository.default_branch, codeScanningConfig.workflow)
                    if (reusableWorkflowUsed) {
                        core.info(`[${repository.name}]: Repository has Code Scanning enabled and reusable workflow in use, installing 'verify-scans' GitHub App`)
                        await installVerifyScansApp(this.adminClient, this.config.verify_scans_installationID, repository.id)

                        core.info(`[${repository.name}]: [repo-already-configured] Successfully installed 'verify-scans' repository`)
                        return
                    } else {
                        core.info(`[${repository.name}]: Repository has Code Scanning enabled, but is not using the reusable workflow, executing configuration`)
                    }
                }
            }

            core.info(`[${repository.name}]: Retrieving repository languages`)
            const languages = await getSupportedCodeQLLanguages(octokit, repository.owner.login, repository.name)
            if (languages.length === 0) {
                core.warning(`[${repository.name}]: [skipped-no-supported-languages] Skipping repository as it does not contain any supported languages`)
                return
            }

            core.info(`[${repository.name}]: Generating CodeQL workflow for supported languages: [${languages.join(', ')}]`)
            const canonicalLanguages = mapLanguages(languages)
            const workflow = generateCodeQLWorkflow(canonicalLanguages, repository.default_branch)
            const emass = generateEMASSJson()

            core.info(`[${repository.name}]: Retrieving SHA for branch ${repository.default_branch}`)
            const sha = await getDefaultRefSHA(octokit, repository.owner.login, repository.name, repository.default_branch)

            core.info(`[${repository.name}]: Checking if '${SOURCE_BRANCH_NAME}' branch exists`)
            const branchExists = await refExists(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME)
            if (!branchExists) {
                core.info(`[${repository.name}]: Creating '${SOURCE_BRANCH_NAME}' branch`)
                await createRef(octokit, repository.owner.login, repository.name, sha, SOURCE_BRANCH_NAME)
            } else {
                core.info(`[${repository.name}]: Skipping branch creation as branch already exists`)
            }

            core.info(`[${repository.name}]: Checking if '.github/workflows/codeql-analysis.yml' exists`)
            const workflowExists = await fileExistsOnBranch(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml')
            if (!workflowExists) {
                core.info(`[${repository.name}]: Creating '.github/workflows/codeql-analysis.yml'`)
                await createFile(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml', 'Create CodeQL workflow', workflow)
            } else {
                core.info(`[${repository.name}]: File already exists, retrieving SHA`)
                const workflowSHA = await getFileRefSHA(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml')

                core.info(`[${repository.name}]: Updating '.github/workflows/codeql-analysis.yml'`)
                await updateFile(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml', 'Update CodeQL workflow', workflow, workflowSHA)
            }

            core.info(`[${repository.name}]: Checking if '.github/emass.json' exists`)
            const emassExists = await fileExistsOnBranch(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/emass.json')
            if (!emassExists) {
                core.info(`[${repository.name}]: Creating '.github/emass.json'`)
                await createFile(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/emass.json', 'Create emass.json file', emass)
            } else {
                core.warning(`[${repository.name}]: Skipping emass.json creation as file already exists`)
            }

            core.info(`[${repository.name}]: Generating pull request body with supported languages: [${languages.join(', ')}]`)
            const pullRequestBody = generatePullRequestBody(languages, this.config.pull_request_body, repository.owner.login, repository.name, SOURCE_BRANCH_NAME)

            core.info(`[${repository.name}]: Creating CodeQL pull request: ${repository.html_url}/pulls`)
            await createPullRequest(this.adminClient, repository.owner.login, repository.name, PULL_REQUEST_TITLE, SOURCE_BRANCH_NAME, repository.default_branch, pullRequestBody)

            core.info(`[${repository.name}]: Installing 'verify-scans' GitHub App`)
            await installVerifyScansApp(this.adminClient, this.config.verify_scans_installationID, repository.id)

            core.info(`[${repository.name}]: [installed-verify-scans-application] Successfully installed 'verify-scans' repository`)
            core.info(`[${repository.name}]: [successfully-configured] Repository successfully configured`)
        } catch (e) {
            core.error(`[${repository.name}]: [configuration-failed] Failed to process repository: ${e}`)
        }
    }
}

exports.Manager = Manager


/***/ }),

/***/ 747:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const yaml = __nccwpck_require__(865)
const core = __nccwpck_require__(385)

const DRY_RUN = process.env.DRY_RUN && process.env.DRY_RUN.toLowerCase() === 'true'
const ENABLE_DEBUG = process.env.ACTIONS_STEP_DEBUG && process.env.ACTIONS_STEP_DEBUG.toLowerCase() === 'true'
const SOURCE_REPO = 'department-of-veterans-affairs/codeql-tools'

const analysisTemplate = {
    name: 'CodeQL',
    on: {
        push: {
            branches: []
        },
        pull_request: {
            branches: []
        },
        schedule: [
            {
                cron: '34 15 * * 5'
            }
        ],
        workflow_dispatch: null
    },
    jobs: {
        analyze: {
            name: 'Analyze',
            'runs-on': 'ubuntu-latest',
            concurrency: '${{ github.workflow }}-${{ matrix.language }}-${{ github.ref }}',
            permissions: {
                actions: 'read',
                contents: 'read',
                'security-events': 'write'
            },
            strategy: {
                'fail-fast': false,
                matrix: {
                    language: []
                }
            },
            steps: [
                {
                    name: 'Run Code Scanning',
                    uses: 'department-of-veterans-affairs/codeql-tools/codeql-analysis@main',
                    with: {
                        language: '${{ matrix.language }}'
                    }
                }
            ]
        }
    }
}

/**
 * Checks if the default code scanning configuration is enabled for a repository
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns {Promise<boolean>} - True if default code scanning configuration is enabled, false otherwise
 *
 * @throws {Error} - If the default code scanning configuration could not be retrieved
 */
exports.defaultCodeScanningEnabled = async (octokit, owner, repo) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/code-scanning?apiVersion=2022-11-28#get-a-code-scanning-default-setup-configuration
        const {data: codeScanning} = await octokit.request('GET /repos/{org}/{repo}/code-scanning/default-setup', {
            org: owner,
            repo: repo
        })

        return codeScanning.state === 'configured'
    } catch (e) {
        throw new Error(`Failed to retrieve default code scanning configuration: ${e.message}`)
    }
}

/**
 * Checks if a specific file exists in a repository on the default branch
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - Path to file
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 *
 * @throws {Error} - If the file could not be checked
 */
exports.fileExistsOnDefaultBranch = async (octokit, owner, repo, path) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#get-repository-content
        await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: owner,
            repo: repo,
            path: path
        })

        return true
    } catch (e) {
        if (e.status === 404) {
            return false
        }

        throw new Error(`Failed to check if file exists: ${e.message}`)
    }
}

/**
 * Checks if a specific file exists in a repository
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name
 * @param path - Path to file
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 *
 * @throws {Error} - If the file could not be checked
 */
exports.fileExistsOnBranch = async (octokit, owner, repo, branch, path) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#get-repository-content
        await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })

        return true
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw new Error(`Failed to check if file exists: ${e.message}`)
    }
}

/**
 * Creates a string representation of the workflow file definition as YAML
 * @param languages - List of languages to analyze
 * @param defaultBranch - Default branch of the repository
 * @returns {string} - String representation of the workflow file definition as YAML
 *
 * @throws {Error} - If the workflow file could not be generated
 */
exports.generateCodeQLWorkflow = (languages, defaultBranch) => {
    try {
        const workflow = analysisTemplate
        const minute = Math.floor(Math.random() * 60)
        const hour = Math.floor(Math.random() * 24)
        const dayOfWeek = Math.floor(Math.random() * 7)
        workflow.on.schedule[0].cron = `${minute} ${hour} * * ${dayOfWeek}`
        workflow.on.push.branches = [defaultBranch]
        workflow.on.pull_request.branches = [defaultBranch]
        workflow.jobs.analyze.strategy.matrix.language = languages

        return yaml.dump(workflow, {indent: 2})
    } catch (e) {
        throw new Error(`Failed to generate CodeQL workflow: ${e.message}`)
    }
}

/**
 * Creates a string representation of the EMASS JSON file
 * @returns {string} - String representation of the EMASS JSON file
 */
exports.generateEMASSJson = () => {
    return JSON.stringify({
        systemID: 0,
        systemName: '<system_name>',
        systemOwnerName: '<full_name>',
        systemOwnerEmail: '<email>'
    }, null, 2)
}

/**
 * Create a string representation of a pull request body
 * @param languages - List of languages to analyze
 * @param template - Pull request body template
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 * @returns {string} - String representation of a pull request body
 */
exports.generatePullRequestBody = (languages, template, org, repo, branch) => {
    const languageList = languages.map(language => `- \`${language}\``).join('\n')
    return template.replaceAll('<LANGUAGES_PLACEHOLDER>', languageList)
        .replaceAll('<CODEQL_WORKFLOW_URL_PLACEHOLDER>', `https://github.com/${org}/${repo}/blob/${branch}/.github/workflows/codeql-analysis.yml`)
        .replaceAll('<EXCLUDED_LANGUAGES_URL_PLACEHOLDER>', `https://github.com/${org}/${repo}/tree/${branch}/.github`)
}

/**
 * Installs the 'verify-scans' GitHub App on a repository
 * @param octokit - Authenticated Octokit client
 * @param installationID - GitHub App installation ID
 * @param repositoryID - Repository ID
 * @returns {Promise<void>} - Promise that resolves when the GitHub App has been installed
 *
 * @throws {Error} - If the GitHub App could not be installed
 */
exports.installVerifyScansApp = async (octokit, installationID, repositoryID) => {
    try {
        if (!DRY_RUN) {
            // https://docs.github.com/en/enterprise-cloud@latest/rest/apps/installations?apiVersion=2022-11-28#add-a-repository-to-an-app-installation
            await octokit.request('PUT /user/installations/{installation_id}/repositories/{repository_id}', {
                installation_id: installationID,
                repository_id: repositoryID
            })
        }
    } catch (e) {
        throw new Error(`Failed to install 'verify-scans' GitHub App: ${e.message}`)
    }
}

/**
 * Maps languages whose CodeQL language support is provided by another languages query packs
 * @param languages - List of languages to analyze
 * @returns {string[]} - Array of languages mapped to their corresponding query pack
 */
exports.mapLanguages = (languages) => {
    const mappedLanguages = languages.map(language => {
        switch (language) {
            case 'c':
                return 'cpp'
            case 'c#':
                return 'csharp'
            case 'c++':
                return 'cpp'
            case 'kotlin':
                return 'java'
            case 'typescript':
                return 'javascript'
            default:
                return language
        }
    })

    return [...new Set(mappedLanguages)]
}

/**
 * Checks if a branch exists in a repository
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name
 * @returns {Promise<boolean>} - True if branch exists, false otherwise
 *
 * @throws {Error} - If the branch could not be checked
 */
exports.refExists = async (octokit, owner, repo, branch) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/git/refs?apiVersion=2022-11-28#get-a-reference
        await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner: owner,
            repo: repo,
            ref: `heads/${branch}`
        })

        return true
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw e
    }
}

/**
 * Checks if the `codeql-analysis` reusable workflow is in use by a repository
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name
 * @param path - Path to the workflow file
 * @returns {Promise<boolean>} - True if the workflow is in use, false otherwise
 *
 * @throws {Error} - If the workflow could not be checked
 */
exports.reusableWorkflowInUse = async (octokit, owner, repo, branch, path) => {
    try {
        // https://docs.github.com/en/enterprise-cloud@latest/rest/repos/contents?apiVersion=2022-11-28#get-repository-content
        const {data: workflow} = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })
        const decodedContent = Buffer.from(workflow.content, 'base64').toString('utf-8')

        if (ENABLE_DEBUG) {
            core.info(`[TRACE] reusableWorkflowInUse: ${decodedContent}`)
        }

        return decodedContent.includes(SOURCE_REPO)
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw e
    }
}


/***/ }),

/***/ 816:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

// TODO: Add GitHub API versioning headers to all requests

const {Octokit} = __nccwpck_require__(8)
const {retry} = __nccwpck_require__(979)
const {throttling} = __nccwpck_require__(69)
const {App} = __nccwpck_require__(389)
const utils = __nccwpck_require__(912);

const _Octokit = Octokit.plugin(retry, throttling)

exports.supportedCodeQLLanguages = [
    'c',
    'cpp',
    'csharp',
    'go',
    'java',
    'kotlin',
    'javascript',
    'python',
    'ruby',
    'typescript',
    'swift'
]

const throttlingOptions = {
    onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`)
        if (options.request.retryCount <= 1) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`)
            return true
        }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`)
        return true
    },
}

exports.createCodeQLGitHubClient = () => {
    const retryingOctokit = utils.GitHub.plugin(retry);
    return new retryingOctokit({
        baseUrl: "https://api.github.com",
        // TODO: Confirm the API's don't need a versioned user agent so we don't have to maintain this
        userAgent: "CodeQL-Action/2.2.6",
    })
}

exports.createGitHubClient = (token) => {
    return new _Octokit({
        auth: token,
        throttle: throttlingOptions
    })
}

exports.createGitHubAppClient = async (id, privateKey) => {
    return new App({
        appId: id,
        privateKey: privateKey,
        Octokit: _Octokit.defaults({
            throttle: throttlingOptions
        })
    })
}


/***/ }),

/***/ 385:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 912:
/***/ ((module) => {

module.exports = eval("require")("@actions/github/lib/utils");


/***/ }),

/***/ 389:
/***/ ((module) => {

module.exports = eval("require")("@octokit/app");


/***/ }),

/***/ 979:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-retry");


/***/ }),

/***/ 69:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-throttling");


/***/ }),

/***/ 8:
/***/ ((module) => {

module.exports = eval("require")("@octokit/rest");


/***/ }),

/***/ 865:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
// TODO: Add tests
const core = __nccwpck_require__(385)

const {parseInput} = __nccwpck_require__(304)
const {getInstalledRepos} = __nccwpck_require__(938)
const {Manager} = __nccwpck_require__(120)
const {createGitHubClient, createGitHubAppClient} = __nccwpck_require__(816)

/**
 * Main function
 *
 * @returns {Promise<void>} - A promise that resolves when the function is done
 */
const main = async () => {
    core.info('Parsing Actions input')
    const config = parseInput()

    core.info('Instantiating admin GitHub client')
    const adminClient = await createGitHubClient(config.admin_token)

    core.info('Instantiating configure-codeql GitHub app client')
    const configureCodeQLApp = await createGitHubAppClient(config.configure_codeql_id, config.configure_codeql_privateKey)

    core.info('Instantiating configure-codeql GitHub installation client')
    const configureCodeQLInstallationClient = await configureCodeQLApp.getInstallationOctokit(config.configure_codeql_installationID)

    core.info('Instantiating verify-scans GitHub app client')
    const verifyScansApp = await createGitHubAppClient(config.verify_scans_id, config.verify_scans_privateKey)
    const verifyScansInstallationClient = await verifyScansApp.getInstallationOctokit(config.verify_scans_installationID)
    const verifyScansInstalledRepositories = await getInstalledRepos(verifyScansInstallationClient)

    core.info('Instantiating Management application')
    const manager = new Manager(adminClient, config, verifyScansInstalledRepositories)

    if (config.repo === '') {
        core.info(`Processing all repositories`)
        await configureCodeQLApp.eachRepository(async ({octokit, repository}) => {
            await manager.processRepository(octokit, repository)
        })
    } else {
        core.info(`[${config.repo}]: Processing single repository`)
        const {data: repository} = await adminClient.repos.get({
            owner: config.org,
            repo: config.repo
        })
        await manager.processRepository(configureCodeQLInstallationClient, repository)
    }

    core.info('Finished processing all repositories, generating summary')
}

main().catch(e => core.setFailed(e.message))

})();

module.exports = __webpack_exports__;
/******/ })()
;