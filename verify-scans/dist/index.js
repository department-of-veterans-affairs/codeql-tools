/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 816:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

// TODO: Add GitHub API versioning headers to all requests

const {Octokit} = __nccwpck_require__(8)
const {retry} = __nccwpck_require__(979)
const {throttling} = __nccwpck_require__(69)
const {App} = __nccwpck_require__(389)
const utils = __nccwpck_require__(912);

const _Octokit = Octokit.plugin(retry, throttling)

exports.supportedCodeQLLanguages = [
    'c',
    'cpp',
    'csharp',
    'go',
    'java',
    'kotlin',
    'javascript',
    'python',
    'ruby',
    'typescript',
    'swift'
]

const throttlingOptions = {
    onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`)
        if (options.request.retryCount <= 1) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`)
            return true
        }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`)
        return true
    },
}

exports.createCodeQLGitHubClient = () => {
    const retryingOctokit = utils.GitHub.plugin(retry);
    return new retryingOctokit({
        baseUrl: "https://api.github.com",
        // TODO: Confirm the API's don't need a versioned user agent so we don't have to maintain this
        userAgent: "CodeQL-Action/2.2.6",
    })
}

exports.createGitHubClient = (token) => {
    return new _Octokit({
        auth: token,
        throttle: throttlingOptions
    })
}

exports.createGitHubAppClient = async (id, privateKey) => {
    return new App({
        appId: id,
        privateKey: privateKey,
        Octokit: _Octokit.defaults({
            throttle: throttlingOptions
        })
    })
}


/***/ }),

/***/ 385:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 912:
/***/ ((module) => {

module.exports = eval("require")("@actions/github/lib/utils");


/***/ }),

/***/ 389:
/***/ ((module) => {

module.exports = eval("require")("@octokit/app");


/***/ }),

/***/ 979:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-retry");


/***/ }),

/***/ 69:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-throttling");


/***/ }),

/***/ 8:
/***/ ((module) => {

module.exports = eval("require")("@octokit/rest");


/***/ }),

/***/ 641:
/***/ ((module) => {

module.exports = eval("require")("axios");


/***/ }),

/***/ 87:
/***/ ((module) => {

module.exports = eval("require")("axios-retry");


/***/ }),

/***/ 865:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


/***/ }),

/***/ 252:
/***/ ((module) => {

module.exports = eval("require")("nodemailer");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
// TODO: Add tests
// TODO: Add licensing and license headers
// TODO: Add function documentation
// TODO: Add retry logic
// TODO: Add email templates
// TODO: add error arrays for all error types for reporting
const yaml = __nccwpck_require__(865)
const core = __nccwpck_require__(385)
const axios = __nccwpck_require__(641)
const axiosRetry = __nccwpck_require__(87)
const nodemailer = __nccwpck_require__(252)
const {createGitHubAppClient, supportedCodeQLLanguages, createGitHubClient} = __nccwpck_require__(816)

axiosRetry(axios, {
    retries: 3
})

const DRY_RUN = (process.env.DRY_RUN && process.env.DRY_RUN.toLowerCase() === 'true') || process.env.DISABLE_NOTIFICATIONS && process.env.DISABLE_NOTIFICATIONS.toLowerCase() === 'true'
const ENABLE_DEBUG = process.env.ACTIONS_STEP_DEBUG && process.env.ACTIONS_STEP_DEBUG.toLowerCase() === 'true'

const main = async () => {
    core.info('Parsing Actions input')
    const config = parseInput()

    core.info('Initializing NodeMailer client')
    const mailer = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.gmail_user,
            pass: config.gmail_password,
        },
    })

    core.info('Instantiating admin GitHub client')
    const adminClient = await createGitHubClient(config.admin_token)

    core.info('Instantiating verify-scans GitHub app client')
    const verifyScansApp = await createGitHubAppClient(config.verify_scans_app_id, config.verify_scans_private_key)

    core.info('Instantiating verify-scans GitHub installation client')
    const verifyScansInstallationClient = await verifyScansApp.getInstallationOctokit(config.verify_scans_installation_id)

    core.info('Instantiating emass-promotion GitHub app client')
    const emassPromotionApp = await createGitHubAppClient(config.emass_promotion_app_id, config.emass_promotion_private_key)

    core.info('Creating EMASS Promotion installation client')
    const emassPromotionInstallationClient = await emassPromotionApp.getInstallationOctokit(config.emass_promotion_installation_id)

    core.info('Retrieving latest CodeQL CLI versions')
    const codeQLVersions = await getLatestCodeQLVersions(adminClient)
    core.info(`Latest CodeQL CLI versions: ${JSON.stringify(codeQLVersions)}`)

    core.info(`Retrieving System ID list`)
    const systemIDs = await getFileArray(adminClient, config.org, '.github-internal', '.emass-system-include')

    if (config.repo === '') {
        core.info(`Processing all repositories`)
        await verifyScansApp.eachRepository(async ({octokit, repository}) => {
            await processRepository(octokit, mailer, config, repository, codeQLVersions, systemIDs, adminClient, emassPromotionInstallationClient)
        })
    } else {
        core.info(`[${config.repo}]: Processing single repository`)
        const {data: repository} = await adminClient.repos.get({
            owner: config.org,
            repo: config.repo
        })
        await processRepository(verifyScansInstallationClient, mailer, config, repository, codeQLVersions, systemIDs, adminClient, emassPromotionInstallationClient)
    }
}

const processRepository = async (octokit, mailer, config, repository, codeQLVersions, systemIDs, adminClient, emassPromotionInstallationClient) => {
    try {
        core.info(`[${repository.name}]: Checking if repository is archived`)
        if (repository.archived) {
            core.info(`[${repository.name}]: Repository archived, uninstalling eMASS Promotion GitHub App`)
            await uninstallApp(adminClient, config.emass_promotion_installation_id, repository.id)
            core.info(`[${repository.name}]: Repository archived, uninstalling Verify Scans GitHub App`)
            await uninstallApp(adminClient, config.verify_scans_installation_id, repository.id)
            core.info(`[${repository.name}]: [skipped-archived] Skipping repository as it is archived`)
            return
        }

        core.info(`[${repository.name}]: Retrieving .emass-repo-ignore file`)
        const emassIgnore = await exists(octokit, repository.owner.login, repository.name, '.github/.emass-repo-ignore')
        if (emassIgnore) {
            core.info(`[${repository.name}]: [skipped-ignored] Found .emass-repo-ignore file, skipping repository`)
            return
        }

        core.info(`[${repository.name}]: Retrieving open issues`)
        const issues = await listOpenIssues(octokit, repository.owner.login, repository.name, ['ghas-non-compliant'])
        core.info(`[${repository.name}]: Found ${issues.length} open issues, closing open issues`)
        await closeIssues(octokit, repository.owner.login, repository.name, issues)

        core.info(`[${repository.name}]: Retrieving codeql.yml file`)
        let codeqlConfig
        let ignoredLanguages = []
        const _codeqlConfigRaw = await getRawFile(octokit, repository.owner.login, repository.name, '.github/codeql.yml')
        if (_codeqlConfigRaw) {
            core.info(`[${repository.name}]: Found codeql.yml file, parsing file`)
            codeqlConfig = yaml.load(_codeqlConfigRaw)

            if (codeqlConfig.excluded_languages) {
                core.info(`[${repository.name}]: Parsing ignored languages`)
                ignoredLanguages = codeqlConfig.excluded_languages.map(language => language.name.toLowerCase())
            }
        }

        core.info(`[${repository.name}]: Retrieving .github/emass.json file`)
        const emassConfig = await getFile(octokit, repository.owner.login, repository.name, '.github/emass.json')

        core.info(`[${repository.name}]: Retrieving supported CodeQL languages`)
        const requiredLanguages = await listLanguages(octokit, repository.owner.login, repository.name, ignoredLanguages)

        if (!emassConfig || !emassConfig.systemOwnerEmail || !emassConfig.systemID || !systemIDs.includes(emassConfig.systemID)) {
            if (emassConfig && emassConfig.systemID && !systemIDs.includes(emassConfig.systemID)) {
                core.warning(`[${repository.name}] [invalid-system-id] Skipping repository as it contains an invalid System ID`)
            }
            if (!emassConfig) {
                core.warning(`[${repository.name}] [missing-configuration] repository missing .github/emass.json`)
            }
            if (emassConfig && !emassConfig.systemOwnerEmail) {
                core.warning(`[${repository.name}] [missing-configuration] repository missing systemOwnerEmail in .github/emass.json`)
            }
            core.warning(`[${repository.name}]: [missing-configuration] .github/emass.json not found, or missing/incorrect eMASS data`)
            core.info(`[${repository.name}]: [generating-email] Sending 'Error: GitHub Repository Not Mapped To eMASS System' email to OIS and system owner`)
            const body = generateMissingEMASSInfoEmail(config.missing_info_email_template, repository.html_url, requiredLanguages)
            const emails = emassConfig && emassConfig.systemOwnerEmail ? [emassConfig.systemOwnerEmail, config.secondary_email] : [config.secondary_email]
            await sendEmail(mailer, config.gmail_from, config.secondary_email, emails, 'Error: GitHub Repository Not Mapped To eMASS System', body)

            const emassMissingIssueExists = await issueExists(octokit, repository.owner.login, repository.name, 'ghas-non-compliant')
            if (!emassMissingIssueExists) {
                core.info(`[${repository.name}]: Creating missing EMASS information issue`)
                const issueBody = generateMissingEMASSInfoIssue(config.missing_info_issue_template, repository.html_url, requiredLanguages)
                await createIssue(adminClient, repository.owner.login, repository.name, 'Error: GitHub Repository Not Mapped To eMASS System', issueBody)
            }

            core.info(`[${repository.name}]: Uninstalling 'emass-promotion' app from repository`)
            await uninstallApp(adminClient, config.emass_promotion_installation_id, repository.id)

            return
        }

        core.info(`[${repository.name}]: Retrieving existing CodeQL analyses`)
        const analyses = await listCodeQLAnalyses(octokit, repository.owner.login, repository.name, repository.default_branch, config.days_to_scan)
        if (analyses.languages.length > 0) {
            core.info(`[${repository.name}]: Analyses found, validating 'emass-promotion' app is installed on repository`)
            const installed = await isAppInstalled(emassPromotionInstallationClient, repository.owner.login, repository.name)
            if (!installed) {
                core.info(`[${repository.name}]: 'emass-promotion' app not installed, installing app on repository`)
                await installApp(adminClient, config.emass_promotion_installation_id, repository.id)
            }

            core.info(`[${repository.name}]: Validating CodeQL CLI version`)
            for (const version of analyses.versions) {
                if (!codeQLVersions.includes(version)) {
                    core.warning(`[${repository.name}]: [out-of-date-cli] Outdated CodeQL CLI version found: ${version}`)
                    core.info(`[${repository.name}]: [generating-email] Sending 'GitHub Repository Code Scanning Software Is Out Of Date' email to OIS and System Owner`)
                    const body = await generateOutOfComplianceCLIEmailBody(config.out_of_compliance_cli_email_template, repository.name, repository.html_url, version)
                    const emails = emassConfig && emassConfig.systemOwnerEmail ? [emassConfig.systemOwnerEmail, config.secondary_email] : [config.secondary_email]
                    await sendEmail(mailer, config.gmail_from, config.secondary_email, emails, 'GitHub Repository Code Scanning Software Is Out Of Date', body)
                    await createIssue(adminClient, repository.owner.login, repository.name, 'GitHub Repository Code Scanning Software Is Out Of Date', body, ['out-of-date-codeql-cli'])
                    core.info(`Uninstalling 'emass-promotion' app from repository`)
                    await uninstallApp(adminClient, config.emass_promotion_installation_id, repository.id)
                    break
                }
            }
        }

        core.info(`[${repository.name}]: Calculating missing analyses languages`)
        const missingAnalyses = await missingLanguages(requiredLanguages, analyses.languages)

        core.info(`[${repository.name}]: Retrieving supported CodeQL database languages`)
        const databaseLanguages = await listCodeQLDatabaseLanguages(octokit, repository.owner.login, repository.name, config.days_to_scan)

        core.info(`[${repository.name}]: Calculating missing database languages`)
        const missingDatabases = await missingLanguages(requiredLanguages, databaseLanguages)

        if (missingAnalyses.length === 0 && missingDatabases.length === 0) {
            core.info(`[${repository.name}]: No missing analyses or databases found`)
            core.info(`[${repository.name}]: [successfully-processed] Successfully processed repository`)
            return
        }

        const missingData = {
            missingAnalyses: missingAnalyses,
            missingDatabases: missingDatabases
        }

        core.warning(`[${repository.name}]: [missing-data] Missing analyses or databases identified: ${JSON.stringify(missingData)}`)
        const uniqueMissingLanguages = [...new Set([...missingAnalyses, ...missingDatabases])]

        core.info(`[${repository.name}]: Generating Non-Compliant repository email body`)
        const body = generateNonCompliantEmailBody(config.non_compliant_email_template, emassConfig.systemID, emassConfig.systemName, repository.html_url, uniqueMissingLanguages)

        core.warning(`[${repository.name}]: [generating-email] Sending 'GitHub Repository Code Scanning Not Enabled' email to system owner`)
        const emails = emassConfig && emassConfig.systemOwnerEmail ? [emassConfig.systemOwnerEmail, config.secondary_email] : [config.secondary_email]
        await sendEmail(mailer, config.gmail_from, config.secondary_email, emails, 'GitHub Repository Code Scanning Not Enabled', body)
        core.info(`Uninstalling 'emass-promotion' app from repository`)
        await uninstallApp(adminClient, config.emass_promotion_installation_id, repository.id)
        core.info(`[${repository.name}]: [system-owner-notified] Successfully sent email to system owner`)
    } catch (e) {
        core.error(`[${repository.name}]: Error processing repository: ${e}`)
    }
}

const parseInput = () => {
    try {
        const admin_token = core.getInput('admin_token', {
            required: true,
            trimWhitespace: true
        })
        const dashboard_repo = core.getInput('dashboard_repo', {
            required: true,
            trimWhitespace: true
        })
        const dashboard_repo_default_branch = core.getInput('dashboard_repo_default_branch', {
            required: true,
            trimWhitespace: true
        })
        const days_to_scan = Number(core.getInput('days_to_scan', {
            required: true,
            trimWhitespace: true
        }))
        const emass_promotion_app_id = Number(core.getInput('ghas_emass_promotion_app_id', {
            required: true,
            trimWhitespace: true
        }))
        const emass_promotion_private_key = core.getInput('ghas_emass_promotion_private_key', {
            required: true,
            trimWhitespace: true
        })
        const emass_promotion_installation_id = Number(core.getInput('ghas_emass_promotion_installation_id', {
            required: true,
            trimWhitespace: true
        }))
        const gmail_from = core.getInput('gmail_from', {
            required: true,
            trimWhitespace: true
        })
        const gmail_user = core.getInput('gmail_user', {
            required: true,
            trimWhitespace: true
        })
        const gmail_password = core.getInput('gmail_password', {
            required: true,
            trimWhitespace: true
        })
        const missing_info_email_template = core.getInput('missing_info_email_template', {
            required: true,
            trimWhitespace: true
        })
        const missing_info_issue_template = core.getInput('missing_info_issue_template', {
            required: true,
            trimWhitespace: true
        })
        const non_compliant_email_template = core.getInput('non_compliant_email_template', {
            required: true,
            trimWhitespace: true
        })
        const org = core.getInput('org', {
            required: true,
            trimWhitespace: true
        })
        const out_of_compliance_cli_email_template = core.getInput('out_of_compliance_cli_email_template', {
            required: true,
            trimWhitespace: true
        })
        const repo = core.getInput('repo', {
            required: false,
            trimWhitespace: true
        })
        const secondary_email = core.getInput('secondary_email', {
            required: true,
        })
        const verify_scans_app_id = Number(core.getInput('ghas_verify_scans_app_id', {
            required: true,
            trimWhitespace: true
        }))
        const verify_scans_private_key = core.getInput('ghas_verify_scans_private_key', {
            required: true,
            trimWhitespace: true
        })
        const verify_scans_installation_id = Number(core.getInput('ghas_verify_scans_installation_id', {
            required: true,
            trimWhitespace: true
        }))

        return {
            admin_token: admin_token,
            dashboard_repo: dashboard_repo,
            dashboard_repo_default_branch: dashboard_repo_default_branch,
            days_to_scan: days_to_scan,
            emass_promotion_app_id: emass_promotion_app_id,
            emass_promotion_private_key: emass_promotion_private_key,
            emass_promotion_installation_id: emass_promotion_installation_id,
            gmail_from: gmail_from,
            gmail_user: gmail_user,
            gmail_password: gmail_password,
            missing_info_email_template: missing_info_email_template,
            missing_info_issue_template: missing_info_issue_template,
            non_compliant_email_template: non_compliant_email_template,
            org: org,
            out_of_compliance_cli_email_template: out_of_compliance_cli_email_template,
            repo: repo,
            secondary_email: secondary_email,
            verify_scans_app_id: verify_scans_app_id,
            verify_scans_private_key: verify_scans_private_key,
            verify_scans_installation_id: verify_scans_installation_id
        }
    } catch (e) {
        core.setFailed(`Failed to parse input: ${e.message}`)
        process.exit(1)
    }
}

const exists = async (octokit, owner, repo, path) => {
    try {
        await octokit.repos.getContent({
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

const getFileArray = async (octokit, owner, repo, path) => {
    try {
        const {data: response} = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })
        const content = Buffer.from(response.content, 'base64').toString().trim()

        if (ENABLE_DEBUG) {
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

const getFile = async (octokit, owner, repo, path) => {
    try {
        const response = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })

        if (ENABLE_DEBUG) {
            core.info(`[TRACE] reusableWorkflowInUse: ${Buffer.from(response.data.content, 'base64').toString()}`)
        }

        return JSON.parse(Buffer.from(response.data.content, 'base64').toString())
    } catch (error) {
        if (error.status === 404) {
            return null
        }
        throw error
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

const missingLanguages = (requiredLanguages, languages) => {
    try {
        return requiredLanguages.filter(language => !languages.includes(language))
    } catch (e) {
        throw new Error(`Failed to calculate missing languages: ${e.message}`)
    }
}

const listLanguages = async (octokit, owner, repo, ignoredLanguages) => {
    try {
        const {data: languages} = await octokit.request('GET /repos/{owner}/{repo}/languages', {
            owner: owner,
            repo: repo
        })

        const mappedLanguages =  Object.keys(languages).map(language => language.toLowerCase())
            .map(language => {
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
            .filter(language => supportedCodeQLLanguages.includes(language))
            .filter(language => !ignoredLanguages.includes(language))

        return [...new Set(mappedLanguages)]
    } catch (e) {
        throw new Error(`Failed to list and filtered languages: ${e.message}`)
    }
}

const listCodeQLDatabaseLanguages = async (octokit, owner, repo, range) => {
    try {
        const {data: databases} = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/codeql/databases', {
            owner: owner,
            repo: repo,
        })

        return databases.filter(database => {
            return validateCodeQLDatabase(octokit, database.created_at, range)
        }).map(database => database.language.toLowerCase())
    } catch (e) {
        throw new Error(`Failed to list CodeQL database languages: ${e.message}`)
    }
}

const validateCodeQLDatabase = (octokit, createdAt, range) => {
    const databaseDate = new Date(createdAt)
    const currentDate = new Date()
    const diffTime = Math.abs(currentDate - databaseDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays <= range
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

            return analyses.filter(analysis => !analysis.analysis_key.startsWith('dynamic'))
        })

        // Find the most recent analysis for each language
        const languages = []
        const versions = []
        for (const analysis of analyses) {
            if (!analysis.category.toLowerCase().startsWith('ois-')) {
                continue
            }
            let language = analysis.category.split('-')[1].split('-')[0]
            if (language === 'kotlin') {
                language = 'java'
            }
            if (!languages.includes(language)) {
                versions.push(analysis.tool.version)
                languages.push(language)
            }
        }

        return {
            languages: languages,
            versions: versions
        }
    } catch (e) {
        if (e.status === 404) {
            return {
                languages: [],
                versions: []
            }
        }
        throw new Error(`Error listing CodeQL analyses for ${owner}/${repo} on branch ${branch}: ${e.message}`)
    }
}

const isAppInstalled = async (octokit, owner, repo) => {
    try {
        await octokit.request('GET /repos/{owner}/{repo}/installation', {
            owner: owner,
            repo: repo
        })
        return true
    } catch (error) {
        if (error.status === 404) {
            return false
        }
        throw error
    }
}

const sendEmail = async (client, from, replyTo, emails, subject, html) => {
    if (!DRY_RUN) {
        await client.sendMail({
            from: from,
            to: emails,
            replyTo: replyTo,
            subject: subject,
            html: html
        })
    }
}

const generateMissingEMASSInfoEmail = (template, repository, languages) => {
    let languageTemplate = ''
    for (const language of languages) {
        languageTemplate += `<li>${language}</li>`
    }

    return template
        .replaceAll('<REPOSITORY_URL_PLACEHOLDER>', repository)
        .replaceAll('<LANGUAGES_PLACEHOLDER>', languageTemplate)
}

const generateMissingEMASSInfoIssue = (template, repository, languages) => {
    let languageTemplate = ''
    for (const language of languages) {
        languageTemplate += `- \`${language}\`\n`
    }

    return template
        .replaceAll('<REPOSITORY_URL_PLACEHOLDER>', repository)
        .replaceAll('<LANGUAGES_PLACEHOLDER>', languageTemplate)
}

const generateNonCompliantEmailBody = (template, systemID, systemName, repository, languages) => {
    let languageTemplate = ''
    for (const language of languages) {
        languageTemplate += `<li>${language}</li>`
    }

    return template
        .replaceAll('<SYSTEM_ID_PLACEHOLDER>', systemID)
        .replaceAll('<SYSTEM_NAME_PLACEHOLDER>', systemName)
        .replaceAll('<REPOSITORY_URL_PLACEHOLDER>', repository)
        .replaceAll('<LANGUAGES_PLACEHOLDER>', languageTemplate)
}

const generateOutOfComplianceCLIEmailBody = (template, repositoryName, repositoryURL, version) => {
    return template
        .replaceAll('<REPOSITORY_URL_PLACEHOLDER>', repositoryURL)
        .replaceAll('<REPOSITORY_NAME_PLACEHOLDER>', repositoryName)
        .replaceAll('<CODEQL_VERSION_PLACEHOLDER>', version)
}

const installApp = async (octokit, installationID, repositoryID) => {
    try {
        if (!DRY_RUN) {
            await octokit.request('PUT /user/installations/{installation_id}/repositories/{repository_id}', {
                installation_id: installationID,
                repository_id: repositoryID
            })
        }
    } catch (e) {
        throw new Error(`Failed to install app: ${e.message}`)
    }
}

const uninstallApp = async (octokit, installationID, repositoryID) => {
    try {
        if (!DRY_RUN) {
            await octokit.request('DELETE /user/installations/{installation_id}/repositories/{repository_id}', {
                installation_id: installationID,
                repository_id: repositoryID
            })
        }
    } catch (e) {
        throw new Error(`Failed to uninstall app: ${e.message}`)
    }
}

const issueExists = async (octokit, owner, repo, label) => {
    try {
        const {data: issues} = await octokit.issues.listForRepo({
            owner: owner,
            repo: repo,
            state: 'open',
            labels: label
        })

        return issues.length > 0
    } catch (e) {
        throw new Error(`Failed to list issues: ${e.message}`)
    }
}

const createIssue = async (octokit, owner, repo, title, body, labels) => {
    if (!DRY_RUN) {
        try {
            await octokit.issues.create({
                owner: owner,
                repo: repo,
                title: title,
                body: body,
                labels: labels ? ['ghas-non-compliant'].concat(labels) : ['ghas-non-compliant']
            })
        } catch (e) {
            throw new Error(`Failed to create issue: ${e.message}`)
        }
    }
}

const getLatestCodeQLVersions = async (client) => {
    try {
        const {data: response} = await client.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: 'github',
            repo: 'codeql-action',
            path: 'src/defaults.json'
        })

        const defaults = JSON.parse(Buffer.from(response.content, 'base64').toString('utf8'))
        return [
            defaults.cliVersion,
            defaults.priorCliVersion
        ]
    } catch (e) {
        throw new Error(`Failed to get latest CodeQL version: ${e.message}`)
    }
}

const listOpenIssues = async (octokit, owner, repo, label) => {
    try {
        const {data: issues} = await octokit.issues.listForRepo({
            owner: owner,
            repo: repo,
            state: 'open',
            labels: label
        })

        return issues
    } catch (e) {
        throw new Error(`Failed to list issues: ${e.message}`)
    }
}

const closeIssues = async (octokit, owner, repo, issues) => {
    try {
        if (!DRY_RUN) {
            for (const issue of issues) {
                await octokit.issues.update({
                    owner: owner,
                    repo: repo,
                    issue_number: issue.number,
                    state: 'closed'
                })
            }
        }
    } catch (e) {
        throw new Error(`Failed to close issues: ${e.message}`)
    }
}

main().catch(e => core.setFailed(e.message))

})();

module.exports = __webpack_exports__;
/******/ })()
;