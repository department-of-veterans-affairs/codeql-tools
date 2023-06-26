// TODO: Add tests
// TODO: Add licensing and license headers
// TODO: Add function documentation
// TODO: Add pull request body template
// TODO: Replace all calls with actual endpoint for clarity (dont use the embedded function)
const core = require('@actions/core')

const {parseInput} = require('./config')
const {getInstalledRepos} = require('./github-get')
const {Manager} = require('./manager')
const {createGitHubClient, createGitHubAppClient} = require('../lib/utils')

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
