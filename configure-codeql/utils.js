const yaml = require('js-yaml')
const core = require('@actions/core')

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
