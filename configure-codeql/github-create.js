const DRY_RUN = process.env.DRY_RUN && process.env.DRY_RUN.toLowerCase() === 'true'

/**
 * Create a new branch in a repository
 * @param octokit - An authenticated octokit client
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param sha - The sha of the commit to branch from
 * @param name - The name of the new branch
 * @returns {Promise<void>} - A promise which resolves when the branch has been created
 *
 * @throws {Error} - If the branch could not be created
 */
exports.createRef = async (octokit, owner, repo, sha, name) => {
    try {
        if (!DRY_RUN) {
            // https://docs.github.com/en/enterprise-cloud@latest/rest/git/refs?apiVersion=2022-11-28#create-a-reference
            await octokit.request('PUT /repos/{owner}/{repo}/git/refs', {
                owner: owner,
                repo: repo,
                ref: `refs/heads/${name}`,
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
            await octokit.request('PUT /repos/{owner}/{repo}/pulls',{
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
