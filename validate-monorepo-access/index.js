import core from '@actions/core'
import yaml from 'js-yaml'
import {createGitHubAppClient} from '../lib/utils.js'

const main = async () => {
    try {
        const config = parseInput()

        core.info('Creating GitHub App Client')
        const octokit = await createGitHubAppClient(config.allowlist_credentials.appID, config.allowlist_credentials.privateKey)

        core.info('Create GitHub Client')
        const client = await octokit.getInstallationOctokit(config.allowlist_credentials.installationID)

        core.info(`[${config.repo}]: Retrieving mono-repo allowlist from ${config.org}/${config.allowlist_repo}/${config.allowlist_path}`)
        const allowlist = await getFileArray(client, config.org, config.allowlist_repo, config.allowlist_path)
        core.info(`[${config.repo}]: Validating repo has access to monorepo features`)
        if (!allowlist.includes(config.repo)) {
            core.setFailed(`[${config.repo}]: Configuration not allowed, repo not enabled for monorepo features, please add to allowlist: https://github.com/${config.org}/${config.allowlist_repo}/blob/main/${config.allowlist_path}`)
            process.exit(1)
        }

        core.info(`[${config.repo}]: Validated repo has access to monorepo features`)
    } catch (e) {
        core.setFailed(`Failed validating access: ${e.message}`)
    }
}

const parseInput = () => {
    const allowlist_credentials = core.getInput('allowlist_credentials', {
        required: true,
        trimWhitespace: true
    })
    const allowlist_path = core.getInput('allowlist_path', {
        required: true,
        trimWhitespace: true
    })
    const allowlist_repo = core.getInput('allowlist_repo', {
        required: true,
        trimWhitespace: true
    })
    const org = core.getInput('org', {
        required: true,
        trimWhitespace: true
    })
    const repo = core.getInput('repo', {
        required: true,
        trimWhitespace: true
    })

    return {
        allowlist_credentials: yaml.load(allowlist_credentials),
        allowlist_path: allowlist_path,
        allowlist_repo: allowlist_repo,
        org: org,
        repo: repo.toLowerCase()
    }
}

const getFileArray = async (octokit, owner, repo, path) => {
    try {
        const {data: response} = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })

        const content = Buffer.from(response.content, 'base64').toString().trim()
        return yaml.load(content).repos
    } catch (e) {
        if (e.status === 404) {
            return new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
        }

        throw new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
    }
}

main().catch(e => {
    core.setFailed(`Failed to bundle and upload database: ${e.message}`)
})
