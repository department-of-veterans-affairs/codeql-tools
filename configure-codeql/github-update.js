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
