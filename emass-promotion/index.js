// TODO: Add tests
// TODO: Add licensing and license headers
// TODO: Add robust error handling
// TODO: Add function documentation
// TODO: Add retry logic
// TODO: Download SARIF file attached to database only
// TODO: add error arrays for all error types for reporting
// TODO: Add logic to create any missing EMASS repositories
// TOD: Allow default branch to be overridden by metadata file
const fs = require('fs')
const core = require('@actions/core')
const axios = require('axios')
const {gzip} = require('node-gzip')
const axiosRetry = require('axios-retry')

axiosRetry(axios, {
    retries: 3
})

const {createCodeQLGitHubClient, createGitHubAppClient, createGitHubClient} = require('../lib/utils')

const ENABLE_DEBUG = process.env.ACTIONS_STEP_DEBUG && process.env.ACTIONS_STEP_DEBUG.toLowerCase() === 'true'
const main = async () => {
    core.info('Parsing Actions input')
    const config = parseInput()

    core.info('Instantiating Admin GitHub client')
    const adminClient = await createGitHubClient(config.admin_token)

    core.info('Instantiating CodeQL Upload GitHub client')
    const codeqlClient = await createCodeQLGitHubClient(config.admin_token)

    core.info('Instantiating emass-promotion GitHub app client')
    const emassPromotionApp = await createGitHubAppClient(config.emass_promotion_app_id, config.emass_promotion_privateKey)

    core.info(`Instantiating emass-promotion GitHub installation client for installation ID ${config.emass_promotion_installation_id}`)
    const emassPromotionInstallation = await emassPromotionApp.getInstallationOctokit(config.emass_promotion_installation_id)

    core.info('Instantiating emass organization GitHub app client')
    const emassOrganizationApp = await emassPromotionApp.getInstallationOctokit(config.emass_organization_installation_id)

    core.info(`Retrieving System ID list`)
    const systemIDs = await getFileArray(adminClient, config.org, '.github-private', '.emass-system-include')

    await emassPromotionApp.eachRepository(async ({octokit, repository}) => {
        try {
            if (repository.owner.login !== config.org) {
                core.info(`[${repository.name}]: Skipping repository as it is not in the ${config.org} organization`)
                return
            }

            core.info(`[${repository.name}]: Retrieving .emass-repo-ignore file`)
            const emassIgnore = await getRawFile(octokit, repository.owner.login, repository.name, '.github/.emass-repo-ignore')
            if (emassIgnore) {
                core.info(`[${repository.name}]: [skipped-ignored] Found .emass-repo-ignore file, skipping repository`)
                return
            }

            // TODO: Push all processing logic into standalone function to enable testing
            core.info(`[${repository.name}]: Processing repository`)
            const emassConfig = await getFileJSON(octokit, repository.owner.login, repository.name, '.github/emass.json')
            if (!emassConfig) {
                core.warning(`[${repository.name}]: [emass-json-not-found] Skipping repository as it does not contain an emass.json file`)
                return
            }

            console.log(systemIDs)

            if (!systemIDs.includes(emassConfig.systemID)) {
                core.warning(`[${repository.name}]: [invalid-system-id] Skipping repository as it contains an invalid System ID`)
                return
            }

            const emassRepoName = `${emassConfig.systemID}-${repository.name}`

            core.info(`[${repository.name}]: Validating EMASS repository exists`)
            const exists = await repoExists(emassOrganizationApp, config.emass_org, emassRepoName)
            if (!exists) {
                core.info(`[${repository.name}]: Repository does not exist, creating EMASS repository '${emassRepoName}'`)
                await createRepo(emassOrganizationApp, config.emass_org, emassRepoName)
            }

            core.info(`[${repository.name}]: Retrieving CodeQL databases`)
            const codeqlDatabases = await listCodeQLDatabases(emassPromotionInstallation, repository.owner.login, repository.name, config.days_to_scan)

            if (codeqlDatabases.length === 0) {
                core.warning(`[${repository.name}]: [skipped-database-not-found] Skipping repository as it does not contain any new CodeQL databases`)
            } else {
                for (const database of codeqlDatabases) {
                    // TODO: Generate app token for each database download
                    core.info(`[${repository.name}]: Downloading CodeQL database ${database.name}`)
                    await downloadCodeQLDatabase(config.admin_token, database.url, `${database.language}-database.zip`)

                    core.info(`[${repository.name}]: Uploading CodeQL database ${database.name}`)
                    await uploadCodeQLDatabase(codeqlClient, config.admin_token, config.emass_org, emassRepoName, database.language, `${database.language}-database.zip`, database.name)

                    core.info(`[${repository.name}]: Cleaning up local Database file`)
                    await deleteLocalFile(`${database.language}-database.zip`)
                }
            }

            core.info(`[${repository.name}]: Retrieving recent CodeQL analysis runs`)
            const codeqlAnalysisRuns = await listCodeQLAnalyses(octokit, repository.owner.login, repository.name, repository.default_branch, config.days_to_scan)
            if (codeqlAnalysisRuns.count === 0) {
                core.warning(`[${repository.name}]: [skipped-sarif-not-found] Skipping repository as it does not contain any new SARIF analyses`)
            } else {
                for (const _analysis of Object.keys(codeqlAnalysisRuns.analyses)) {
                    const analysis = codeqlAnalysisRuns.analyses[_analysis]
                    core.info(`[${repository.name}]: Downloading SARIF analysis ${_analysis}`)
                    const sarif = await downloadAndEncodeAnalysis(octokit, repository.owner.login, repository.name, analysis.id)

                    core.info(`[${repository.name}]: Retrieving default branch`)
                    const defaultBranchSHA = await getDefaultBranchSHA(emassOrganizationApp, config.emass_org, emassRepoName)

                    const branch = analysis.ref.split('refs/heads/')[1]
                    core.info(`[${repository.name}]: Checking if branch ${analysis.ref} exists`)
                    const branchExists = await refExists(emassOrganizationApp, config.emass_org, emassRepoName, analysis.ref)
                    if (!branchExists) {
                        core.info(`[${repository.name}]: Branch does not exist, creating branch ${branch}`)
                        await createRef(adminClient, config.emass_org, emassRepoName, analysis.ref, defaultBranchSHA)

                        core.info(`[${repository.name}]: Setting branch ${branch} as default branch`)
                        await setDefaultBranch(adminClient, config.emass_org, emassRepoName, branch)
                    }

                    core.info(`[${repository.name}]: Uploading SARIF analysis ${_analysis}`)
                    await uploadAnalysis(emassOrganizationApp, config.emass_org, emassRepoName, defaultBranchSHA, analysis.ref, sarif)
                }
            }
            core.info(`[${repository.name}]: [successful-upload] Finished configuring repository`)
            core.info(`[${repository.name}]: [successfully-processed] Successfully processed repository`)
        } catch (error) {
            core.error(`[${repository.name}]: failed processing repository: ${error}`)
        }
    })

    core.info('Finished processing all repositories, generating summary')
}

const parseInput = () => {
    try {
        const admin_token = core.getInput('admin_token', {
            required: true,
            trimWhitespace: true
        })
        const days_to_scan = Number(core.getInput('days_to_scan', {
            required: true,
            trimWhitespace: true
        }))
        const emass_organization_installation_id = core.getInput('ghas_emass_organization_installation_id', {
            required: true,
            trimWhitespace: true
        })
        const emass_promotion_app_id = Number(core.getInput('ghas_emass_promotion_app_id', {
            required: true,
            trimWhitespace: true
        }))
        const emass_promotion_privateKey = core.getInput('ghas_emass_promotion_private_key', {
            required: true,
            trimWhitespace: true
        })
        const emass_promotion_installation_id = Number(core.getInput('ghas_emass_promotion_installation_id', {
            required: true,
            trimWhitespace: true
        }))
        const emass_org = core.getInput('emass_org', {
            required: true,
            trimWhitespace: true
        })
        const org = core.getInput('org', {
            required: true,
            trimWhitespace: true
        })


        return {
            admin_token: admin_token,
            days_to_scan: days_to_scan,
            emass_organization_installation_id: Number(emass_organization_installation_id),
            emass_promotion_app_id: emass_promotion_app_id,
            emass_promotion_privateKey: emass_promotion_privateKey,
            emass_promotion_installation_id: emass_promotion_installation_id,
            emass_org: emass_org,
            org: org
        }
    } catch (e) {
        throw new Error(`Error parsing input: ${e.message}`)
    }
}

const getFileJSON = async (octokit, owner, repo, path) => {
    try {
        const response = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })

        if(ENABLE_DEBUG) {
            core.info(`[TRACE] reusableWorkflowInUse: ${Buffer.from(response.data.content, 'base64').toString()}`)
        }

        return JSON.parse(Buffer.from(response.data.content, 'base64').toString())
    } catch (e) {
        if (e.status === 404) {
            return null
        }
        throw new Error(`Error retrieving ${path} for ${owner}/${repo}: ${e.message}`)
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

        if(ENABLE_DEBUG) {
            core.info(`[TRACE] getFileArray: ${content}`)
        }

        return content.split('\n').filter(line => !line.includes('#')).map(line => Number(line.trim()))
    } catch (e) {
        if (e.status === 404) {
            return null
        }
        throw new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
    }
}

const listCodeQLDatabases = async (octokit, owner, repo, range) => {
    try {
        const {data: databases} = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/codeql/databases', {
            owner: owner,
            repo: repo,
        })

        return databases.filter(async (database) => {
            return await validateCodeQLDatabase(octokit, database.created_at, range)
        })
    } catch (e) {
        if (e.status === 404) {
            return []
        }
        throw new Error(`failed retrieving CodeQL databases for ${owner}/${repo}: ${e.message}`)
    }
}

const validateCodeQLDatabase = async (octokit, createAt, range) => {
    const databaseDate = new Date(createAt)
    const currentDate = new Date()
    const diffTime = Math.abs(currentDate - databaseDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays <= range
}

const downloadCodeQLDatabase = async (token, url, path) => {
    try {
        const response = await axios.get(url, {
            url: url,
            responseType: 'arraybuffer',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/zip'
            }
        })

        fs.writeFileSync(path, response.data)
    } catch (e) {
        throw new Error(`failed downloading CodeQL database: ${e.message}`)
    }
}

const uploadCodeQLDatabase = async (octokit, token, owner, repo, language, path, name) => {
    try {
        const bundledDbSize = fs.statSync(path).size
        const bundledDbReadStream = fs.createReadStream(path)
        await octokit.request(`POST https://uploads.github.com/repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name`, {
                owner: owner,
                repo: repo,
                language: language,
                name: name,
                data: bundledDbReadStream,
                headers: {
                    "authorization": `token ${token}`,
                    "Content-Type": "application/zip",
                    "Content-Length": bundledDbSize,
                },
            }
        )
    } catch (e) {
        throw new Error(`failed uploading CodeQL database: ${e.message}`)
    }
}

const listCodeQLAnalyses = async (octokit, owner, repo, branch, range) => {
    try {
        const analyses = await octokit.paginate('GET /repos/{owner}/{repo}/code-scanning/analyses', {
            owner: owner,
            repo: repo,
            tool_name: 'CodeQL',
            ref: `refs/heads/${branch}`,
            direction: 'desc',
            sort: 'created',
            per_page: 100
        }, (response, done) => {
            const analyses = response.data
            if (analyses.length === 0) {
                done()
                return analyses
            }
            // Check if any analysis created_at is older than the range
            const finished = analyses.some(analysis => {
                const analysisDate = new Date(analysis.created_at)
                const currentDate = new Date()
                const diffTime = Math.abs(currentDate - analysisDate)
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

                return diffDays > range
            })

            if (finished) {
                done()
            }

            return analyses
        })

        // Find the most recent analysis for each language
        const returnAnalyses = {
            count: 0,
            analyses: {}
        }
        for (const analysis of analyses) {
            const environment = JSON.parse(analysis.environment)
            const language = environment.language
            if (!returnAnalyses.analyses[language]) {
                returnAnalyses.count++
                returnAnalyses.analyses[language] = analysis
            } else {
                const existingAnalysisDate = new Date(returnAnalyses.analyses[language].created_at)
                const newAnalysisDate = new Date(analysis.created_at)
                if (newAnalysisDate > existingAnalysisDate) {
                    returnAnalyses.analyses[language] = analysis
                }
            }
        }

        return returnAnalyses
    } catch (e) {
        if (e.status === 404) {
            return []
        }
        throw new Error(`failed retrieving CodeQL analyses for ${owner}/${repo}: ${e.message}`)
    }
}

const downloadAndEncodeAnalysis = async (octokit, owner, repo, id) => {
    try {
        const {data: sarif} = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}', {
            owner: owner,
            repo: repo,
            analysis_id: id,
            headers: {
                'Accept': 'application/sarif+json'
            }
        })

        const compressedSarif = await gzip(JSON.stringify(sarif))
        return Buffer.from(compressedSarif).toString('base64')
    } catch (e) {
        throw new Error(`failed downloading and encoding CodeQL analysis: ${e.message}`)
    }
}

const uploadAnalysis = async (octokit, owner, repo, sha, ref, sarif) => {
    try {
        await octokit.request('POST /repos/{owner}/{repo}/code-scanning/sarifs', {
            owner: owner,
            repo: repo,
            commit_sha: sha,
            ref: ref,
            sarif: sarif
        })
    } catch (e) {
        throw new Error(`failed uploading CodeQL analysis: ${e.message}`)
    }
}

const repoExists = async (octokit, owner, repo) => {
    try {
        await octokit.request('GET /repos/{owner}/{repo}', {
            owner: owner,
            repo: repo
        })
        return true
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw new Error(`failed checking if repo exists: ${e.message}`)
    }
}

const getDefaultBranchSHA = async (octokit, owner, repo, branch) => {
    try {
        const {data: commits} = await octokit.repos.listCommits({
            owner: owner,
            repo: repo,
            sha: branch,
            per_page: 1
        })

        return commits[0].sha
    } catch (e) {
        throw new Error(`failed retrieving default branch SHA: ${e.message}`)
    }
}

const createRepo = async (octokit, org, repo) => {
    try {
        await octokit.repos.createInOrg({
            org: org,
            name: repo,
            visibility: 'private',
            has_issues: false,
            has_projects: false,
            has_wiki: false,
            auto_init: true
        })


    } catch (e) {
        throw new Error(`failed creating repo: ${e.message}`)
    }
}

const refExists = async (octokit, owner, repo, ref) => {
    try {
        await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner: owner,
            repo: repo,
            ref: ref
        })
        return true
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw new Error(`failed checking if ref exists: ${e.message}`)
    }
}

const createRef = async (octokit, owner, repo, ref, sha) => {
    try {
        await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
            owner: owner,
            repo: repo,
            ref: ref,
            sha: sha
        })
    } catch (e) {
        if (e.message.includes('exists')) {
            return
        }
        throw new Error(`failed creating ref: ${e.message}`)
    }
}

const setDefaultBranch = async (octokit, owner, repo, branch) => {
    try {
        await octokit.repos.update({
            owner: owner,
            repo: repo,
            default_branch: branch
        })
    } catch (e) {
        throw new Error(`failed setting default branch: ${e.message}`)
    }
}

const deleteLocalFile = async (path) => {
    try {
        fs.unlinkSync(path)
    } catch (e) {
        throw new Error(`failed deleting local file: ${e.message}`)
    }
}

const getRawFile = async (octokit, owner, repo, path) => {
    try {
        const response = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })

        if (ENABLE_DEBUG) {
            core.info(`[TRACE] reusableWorkflowInUse: ${Buffer.from(response.data.content, 'base64').toString()}`)
        }

        return Buffer.from(response.data.content, 'base64').toString()
    } catch (error) {
        if (error.status === 404) {
            return null
        }
        throw error
    }
}

main().catch(e => core.setFailed(e.message))
