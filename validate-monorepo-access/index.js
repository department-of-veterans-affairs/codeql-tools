
const core = require('@actions/core')
const {createGitHubClient} = require("../lib/utils")
const main = async () => {
    try {
        const config = parseInput()

        core.info('Creating GitHub Client')
        const octokit = createGitHubClient(config.allowlist_token)

        core.info(`[${config.repo}]: Retrieving mono-repo allowlist from ${config.org}/${config.allowlist_repo}/${config.allowlist_path}`)
        const allowlist = await getFileArray(octokit, config.org, config.allowlist_repo, config.allowlist_path)
        core.info(`[${config.repo}]: Validating repo has access to monorepo features`)
        if (!allowlist.includes(config.repo)) {
            core.setFailed(`[${config.repo}]: Configuration not allowed, repo not enabled for monorepo features, please add to allowlist: https://github.com/${config.org}/${config.allowlist_repo}/blob/main/${config.allowlist_path}`)
            process.exit(1)
        }

        core.info(`[${config.repo}]: Validated repo has access to monorepo features`)
    } catch (e) {
        core.setFailed(`Unable to upload database: ${e.message}`)
    }
}

const parseInput = () => {
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
    const allowlist_token = core.getInput('allowlist_token', {
        required: true,
        trimWhitespace: true
    })

    return {
        allowlist_path: allowlist_path,
        allowlist_repo: allowlist_repo,
        allowlist_token: allowlist_token,
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
        return content.split('\n').filter(line => !line.includes('#'))
    } catch (e) {
        if (e.status === 404) {
            return null
        }

        throw new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
    }
}

main().catch(e => {
    core.setFailed(`Failed to bundle and upload database: ${e.message}`)
})
