const core = require('@actions/core')
const {
    fileExistsOnDefaultBranch,
    defaultCodeScanningEnabled,
    reusableWorkflowInUse,
    installVerifyScansApp,
    generateCodeQLWorkflow,
    generateEMASSJson,
    refExists,
    fileExistsOnBranch,
    generatePullRequestBody
} = require('./utils')
const {getCodeQLStatus, getSupportedCodeQLLanguages, getDefaultRefSHA, getFileRefSHA} = require('./github-get')
const {createRef, createFile, createPullRequest} = require('./github-create')
const {updateFile} = require('./github-update')

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
            const workflow = generateCodeQLWorkflow(languages, repository.default_branch)
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
