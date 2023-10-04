const {supportedCodeQLLanguages} = require('../lib/utils')
const {mapLanguages} = require('./utils')

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

        return mapLanguages(Object.keys(languages).map(language => language.toLowerCase())).filter(language => supportedCodeQLLanguages.includes(language))
    } catch (e) {
        throw new Error(`Failed to retrieve supported CodeQL languages: ${e.message}`)
    }
}
