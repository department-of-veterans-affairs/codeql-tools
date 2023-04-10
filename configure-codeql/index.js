// TODO: Add tests
// TODO: Add licensing and license headers
// TODO: Add function documentation
// TODO: Add pull request body template
// TODO: add error arrays for all error types for reporting
// TODO: Replace all calls with actual endpoint for clarity (dont use the embedded function)

const yaml = require('js-yaml')
const core = require('@actions/core')

const {createGitHubClient, createGitHubAppClient, supportedCodeQLLanguages} = require('../lib/utils')

const PULL_REQUEST_TITLE = 'Action Required: Configure CodeQL'
const SOURCE_BRANCH_NAME = 'ghas-enforcement-codeql'
const SOURCE_REPO = 'department-of-veterans-affairs/codeql-tools'

const main = async () => {
    const skippedAlreadyConfigured = []
    const skippedNoSupportedLanguages = []
    const installedVerifyScansApp = []
    const installedVerifyScansAppRepoAlreadyConfigured = []
    const configFailed = {}

    core.info('Parsing Actions input')
    const config = parseInput()

    core.info('Instantiating admin GitHub client')
    const adminClient = await createGitHubClient(config.admin_token)

    core.info('Instantiating configure-codeql GitHub App client')
    const configureCodeQLApp = await createGitHubAppClient(config.configure_codeql_id, config.configure_codeql_privateKey)

    core.info('Instantiating verify-scans GitHub App client')
    const verifyScansApp = await createGitHubAppClient(config.verify_scans_id, config.verify_scans_privateKey)
    const verifyScansInstalledRepositories = await listInstalledRepos(verifyScansApp, config.verify_scans_installationID, config.org)

    await configureCodeQLApp.eachRepository(async ({octokit, repository}) => {
        try {
            core.info(`Processing ${repository.name}`)
            if (verifyScansInstalledRepositories.includes(repository.name)) {
                core.info(`Skipping ${repository.name} as it is has already been configured via the Configure CodeQL GitHub App Pull Request`)
                skippedAlreadyConfigured.push(repository.name)
                return
            }

            core.info(`Checking if ${repository.name} has Code Scanning enabled`)
            // TODO: Figure out what app permission grants the `security_event` permission
            const codeScanningConfig = await codeScanningEnabled(adminClient, repository.owner.login, repository.name)
            if (codeScanningConfig.enabled) {
                core.info(`Validating ${repository.name} is not using default code scanning configuration`)
                const defaultConfig = await defaultCodeScanningEnabled(adminClient, repository.owner.login, repository.name)
                if (defaultConfig) {
                    core.info(`Repository ${repository.name} has Default Code Scanning enabled, executing configuration`)
                } else {
                    core.info(`Validating reusable workflow in use for ${repository.name}`)
                    const reusableWorkflowUsed = await reusableWorkflowInUse(adminClient, repository.owner.login, repository.name, repository.default_branch, codeScanningConfig.workflow)
                    if (reusableWorkflowUsed) {
                        core.info(`Repository ${repository.name} has Code Scanning enabled and reusable workflow in use, installing 'verify-scans' GitHub App`)
                        await installVerifyScansApp(adminClient, config.verify_scans_installationID, repository.id)
                        installedVerifyScansAppRepoAlreadyConfigured.push(repository.name)
                        return
                    } else {
                        core.info(`Repository ${repository.name} has Code Scanning enabled, but is not using the reusable workflow, executing configuration`)
                    }
                }
            }

            core.info(`Retrieving languages for ${repository.name}`)
            const languages = await retrieveSupportedCodeQLLanguages(octokit, repository.owner.login, repository.name)
            if (languages.length === 0) {
                core.info(`Skipping ${repository.name} as it does not contain any supported languages`)
                skippedNoSupportedLanguages.push(repository.name)
                return
            }

            core.info(`Generating CodeQL workflow for ${repository.name} for supported languages: [${languages.join(', ')}]`)
            const workflow = generateCodeQLWorkflow(languages, repository.default_branch)
            const emass = generateEMASSJson()

            core.info(`Retrieving SHA for ${repository.name} for branch ${repository.default_branch}`)
            const sha = await getDefaultRefSHA(octokit, repository.owner.login, repository.name, repository.default_branch)

            core.info(`Checking if 'codeql' branch exists for ${repository.name}`)
            const branchExists = await refExists(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME)
            if (!branchExists) {
                core.info(`Creating 'codeql' branch for ${repository.name}`)
                await createRef(octokit, repository.owner.login, repository.name, sha, SOURCE_BRANCH_NAME)
            } else {
                core.info(`Skipping branch creation for ${repository.name} as branch already exists`)
            }

            core.info(`Checking if '.github/workflows/codeql-analysis.yml' exists for ${repository.name}`)
            const workflowExists = await fileExists(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml')
            if (!workflowExists) {
                core.info(`Creating '.github/workflows/codeql-analysis.yml' for ${repository.name}`)
                await createFile(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/workflows/codeql-analysis.yml', 'Create CodeQL workflow', workflow)
            } else {
                core.info(`Skipping CodeQL workflow creation for ${repository.name} as file already exists`)
            }

            core.info(`Checking if '.github/emass.json' exists for ${repository.name}`)
            const emassExists = await fileExists(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/emass.json')
            if (!emassExists) {
                core.info(`Creating '.github/emass.json' for ${repository.name}`)
                await createFile(octokit, repository.owner.login, repository.name, SOURCE_BRANCH_NAME, '.github/emass.json', 'Create emass.json file', emass)
            } else {
                core.info(`Skipping emass.json creation for ${repository.name} as file already exists`)
            }

            core.info(`Generating pull request body for ${repository.name} with supported languages: [${languages.join(', ')}]`)
            const pullRequestBody = generatePullRequestBody(languages, config.pull_request_body, repository.owner.login, repository.name, repository.default_branch)

            core.info(`Creating 'codeql' pull request for ${repository.name}`)
            await createPullRequest(octokit, repository.owner.login, repository.name, PULL_REQUEST_TITLE, SOURCE_BRANCH_NAME, repository.default_branch, pullRequestBody)

            core.info(`Installing 'verify-scans' GitHub App for ${repository.name}`)
            await installVerifyScansApp(adminClient, config.verify_scans_installationID, repository.id)
            installedVerifyScansApp.push(repository.name)
            core.info(`Finished processing ${repository.name}`)
        } catch (e) {
            core.error(`Failed to process ${repository.name}: ${e}`)
            configFailed[repository.name] = e.message
        }
    })

    core.info('Finished processing all repositories, generating summary')
    // TODO: Create shared utility function to generate markdown summary report
}

const parseInput = () => {
    try {
        const admin_token = core.getInput('admin_token', {
            required: true,
            trimWhitespace: true
        })
        const configure_codeql_id = Number(core.getInput('ghas_configure_codeql_app_id', {
            required: true,
            trimWhitespace: true
        }))
        const configure_codeql_privateKey = core.getInput('ghas_configure_codeql_private_key', {
            required: true,
            trimWhitespace: true
        })
        const configure_codeql_installationID = Number(core.getInput('ghas_configure_codeql_installation_id', {
            required: true,
            trimWhitespace: true
        }))
        const org = core.getInput('org', {
            required: true,
            trimWhitespace: true
        })
        const pull_request_body = Number(core.getInput('pull_request_body', {
            required: true,
            trimWhitespace: true
        }))
        const verify_scans_id = Number(core.getInput('ghas_verify_scans_app_id', {
            required: true,
            trimWhitespace: true
        }))
        const verify_scans_private_key = core.getInput('ghas_verify_scans_private_key', {
            required: true,
            trimWhitespace: true
        })
        const verify_scans_installationID = Number(core.getInput('ghas_verify_scans_installation_id', {
            required: true,
            trimWhitespace: true
        }))

        return {
            org: org,
            admin_token: admin_token,
            configure_codeql_id: configure_codeql_id,
            configure_codeql_privateKey: configure_codeql_privateKey,
            configure_codeql_installationID: configure_codeql_installationID,
            pull_request_body: pull_request_body,
            verify_scans_id: verify_scans_id,
            verify_scans_privateKey: verify_scans_private_key,
            verify_scans_installationID: verify_scans_installationID
        }
    } catch (e) {
        core.setFailed(`Failed to parse input: ${e.message}`)
        process.exit(1)
    }
}

const listInstalledRepos = async (octokit, installationID) => {
    try {
        const client = await octokit.getInstallationOctokit(installationID)
        const repos = await client.paginate(client.apps.listReposAccessibleToInstallation, {
            per_page: 100
        })

        return repos.map(repo => repo.name)
    } catch (e) {
        throw new Error(`Failed to list installed repositories: ${e.message}`)
    }
}

const codeScanningEnabled = async (octokit, owner, repo) => {
    try {
        const {data: analyses} = await octokit.codeScanning.listRecentAnalyses({
            owner: owner,
            repo: repo,
            per_page: 1
        })

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

const installVerifyScansApp = async (octokit, installationID, repositoryID) => {
    try {
        await octokit.apps.addRepoToInstallationForAuthenticatedUser({
            installation_id: installationID,
            repository_id: repositoryID
        })
    } catch (e) {
        throw new Error(`Failed to install 'verify-scans' GitHub App: ${e.message}`)
    }
}

const retrieveSupportedCodeQLLanguages = async (octokit, owner, repo) => {
    try {
        const {data: languages} = await octokit.repos.listLanguages({
            owner: owner,
            repo: repo
        })

        return Object.keys(languages).map(language => language.toLowerCase()).filter(language => supportedCodeQLLanguages.includes(language))
    } catch (e) {
        throw new Error(`Failed to retrieve supported CodeQL languages: ${e.message}`)
    }
}

const analysisTemplate = {
    "name": "CodeQL",
    "on": {
        "push": {
            "branches": []
        },
        "pull_request": {
            "branches": []
        },
        "schedule": [
            {
                "cron": "34 15 * * 5"
            }
        ],
        "workflow_dispatch": null
    },
    "jobs": {
        "analyze": {
            "name": "Analyze",
            "runs-on": "ubuntu-latest",
            "concurrency": "${{ github.workflow }}-${{ github.ref }}",
            "permissions": {
                "actions": "read",
                "contents": "read",
                "security-events": "write"
            },
            "strategy": {
                "fail-fast": false,
                "matrix": {
                    "language": []
                }
            },
            "steps": [
                {
                    "name": "Run Code Scanning",
                    "uses": "department-of-veterans-affairs/codeql-tools/codeql-analysis@main",
                    "with": {
                        "language": "${{ matrix.language }}"
                    }
                }
            ]
        }
    }
}

const generateCodeQLWorkflow = (languages, defaultBranch) => {
    try {
        // const contents = fs.readFileSync(process.cwd() + `/resources/codeql-analysis-template.yml`, 'utf8')
        // const workflow = yaml.load(contents)
        const workflow = analysisTemplate
        workflow.on.schedule[0].cron = generateRandomWeeklyCron()
        workflow.on.push.branches = [defaultBranch]
        workflow.on.pull_request.branches = [defaultBranch]
        workflow.jobs.analyze.strategy.matrix.language = languages

        return yaml.dump(workflow, {indent: 2})
    } catch (e) {
        throw new Error(`Failed to generate CodeQL workflow: ${e.message}`)
    }
}

const generateRandomWeeklyCron = () => {
    const minute = Math.floor(Math.random() * 60)
    const hour = Math.floor(Math.random() * 24)
    const dayOfWeek = Math.floor(Math.random() * 7)

    return `${minute} ${hour} * * ${dayOfWeek}`
}

const generateEMASSJson = () => {
    const emass = {
        systemID: 0,
        SystemName: '<system_name>',
        systemOwnerName: '<full_name>',
        systemOwnerEmail: '<email>',
    }

    return JSON.stringify(emass, null, 2)
}

const getDefaultRefSHA = async (octokit, owner, repo, branch) => {
    try {
        const {data: ref} = await octokit.git.getRef({
            owner: owner,
            repo: repo,
            ref: `heads/${branch}`
        })

        return ref.object.sha
    } catch (e) {
        throw new Error(`Failed to retrieve default branch SHA: ${e.message}`)
    }
}

const refExists = async (octokit, owner, repo, branch) => {
    try {
        await octokit.git.getRef({
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

const createRef = async (octokit, owner, repo, sha, name) => {
    try {
        await octokit.git.createRef({
            owner: owner,
            repo: repo,
            ref: `refs/heads/${name}`,
            sha: sha
        })
    } catch (e) {
        throw new Error(`Failed to create ref: ${e.message}`)
    }
}

const fileExists = async (octokit, owner, repo, branch, path) => {
    try {
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
        throw e
    }
}

const createFile = async (octokit, owner, repo, branch, path, message, content) => {
    try {
        const base64Content = Buffer.from(content).toString('base64')
        await octokit.repos.createOrUpdateFileContents({
            owner: owner,
            repo: repo,
            path: path,
            message: message,
            content: base64Content,
            branch: branch,
            name: 'ghas-configure-codeql[bot]',
            email: '41898282+ghas-configure-codeql[bot]@users.noreply.github.com'
        })
    } catch (e) {
        throw new Error(`Failed to create file: ${e.message}`)
    }
}

const generatePullRequestBody = (languages, template, org, repo, branch) => {
    const languageList = languages.map(language => `- \`${language}\``).join('\n')
    return template.replaceAll('<LANGUAGES_PLACEHOLDER>', languageList)
        .replaceAll('<CODEQL_WORKFLOW_URL_PLACEHOLDER>', `https://github.com/${org}/${repo}/blob/${branch}/.github/workflows/codeql-analysis.yml`)
        .replaceAll('<EXCLUDED_LANGUAGES_URL_PLACEHOLDER>', `https://github.com/${org}/${repo}/tree/${branch}/.github`)
}

const createPullRequest = async (octokit, owner, repo, title, head, base, body) => {
    try {
        await octokit.pulls.create({
            owner: owner,
            repo: repo,
            title: title,
            head: head,
            base: base,
            body: body
        })
    } catch (e) {
        throw new Error(`Failed to create pull request: ${e.message}`)
    }
}

const defaultCodeScanningEnabled = async (octokit, owner, repo) => {
    try {
        const {data: codeScanning} = await octokit.request('/repos/{org}/{repo}/code-scanning/default-setup', {
            org: owner,
            repo: repo
        })

        return codeScanning.state === 'configured'
    } catch (e) {
        throw new Error(`Failed to retrieve default code scanning configuration: ${e.message}`)
    }
}

const reusableWorkflowInUse = async (octokit, owner, repo, branch, path) => {
    try {
        const {data: workflow} = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })
        const decodedContent = Buffer.from(workflow.content, 'base64').toString('utf-8')

        return decodedContent.includes(SOURCE_REPO)
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw e
    }
}

main().catch(e => core.setFailed(e.message))
