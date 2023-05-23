// TODO: Add tests
// TODO: Add licensing and license headers
// TODO: Add function documentation
// TODO: Add retry logic
// TODO: Add email templates
// TODO: add error arrays for all error types for reporting
const yaml = require('js-yaml')
const core = require('@actions/core')
const axios = require('axios')
const axiosRetry = require('axios-retry')
const nodemailer = require('nodemailer')
const {markdownTable} = require('markdown-table')
const {createGitHubAppClient, supportedCodeQLLanguages, createGitHubClient} = require('../lib/utils')

axiosRetry(axios, {
    retries: 3
})

const DISABLE_NOTIFICATIONS = false
const ENABLE_DEBUG = process.env.ACTIONS_STEP_DEBUG && process.env.ACTIONS_STEP_DEBUG.toLowerCase() === 'true'

const CONFIGURED_MISSING_SCANS_REPOS = []
const FULLY_COMPLIANT_REPOS = []
const TOTAL_REPOS = []

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

    core.info(`Retrieving System ID list`)
    const systemIDs = await getFileArray(adminClient, config.org, '.github-internal', '.emass-system-include')

    if(config.repo === '') {
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

    if(config.repo === '') {
        core.info('Finished processing all repositories, generating summary')
        try {
            core.info(`Creating dashboard, retrieving existing dashboard ref`)
            const dashboardRef = await getFileRefSHA(adminClient, config.org, config.dashboard_repo, config.dashboard_repo_default_branch, 'dashboards/enablement.md')

            core.info(`Generating dashboard content`)
            const dashboardContent = await createDashboardMarkdown()

            core.info(`Updating dashboard`)
            await updateFile(adminClient, config.org, config.dashboard_repo, config.dashboard_repo_default_branch, 'dashboards/enablement.md', 'Update dashboard', dashboardContent, dashboardRef)
        } catch (error) {
            core.error(`Error creating dashboard: ${e}`)
        }
        core.info(`Finished generating dashboard`)
    }
}

const processRepository = async (octokit, mailer, config, repository, codeQLVersions, systemIDs, adminClient, emassPromotionInstallationClient) => {
    try {
        core.info(`[${repository.name}]: Retrieving .emass-repo-ignore file`)
        const emassIgnore = await exists(octokit, repository.owner.login, repository.name, '.github/.emass-repo-ignore')
        if (emassIgnore) {
            core.info(`[${repository.name}]: [skipped-ignored] Found .emass-repo-ignore file, skipping repository`)
            return
        }

        TOTAL_REPOS.push(repository.name)
        core.info(`[${repository.name}]: Retrieving open issues`)
        const issues = await listOpenIssues(octokit, repository.owner.login, repository.name, ['ghas-non-compliant'])
        core.info(`[${repository.name}]: Found ${issues.length} open issues, closing open issues`)
        await closeIssues(octokit, repository.owner.login, repository.name, issues)

        core.info(`[${repository.name}]: Retrieving codeql-config.yml file`)
        let codeqlConfig
        let ignoredLanguages = []
        const _codeqlConfigRaw = await getRawFile(octokit, repository.owner.login, repository.name, '.github/codeql-config.yml')
        if (_codeqlConfigRaw) {
            core.info(`[${repository.name}]: Found codeql-config.yml file, parsing file`)
            codeqlConfig = yaml.load(_codeqlConfigRaw)

            core.info(`[${repository.name}]: Parsing ignored languages`)
            ignoredLanguages = codeqlConfig.excluded_languages.map(language => language.name.toLowerCase())
        }

        core.info(`[${repository.name}]: Retrieving .github/emass.json file`)
        const emassConfig = await getFile(octokit, repository.owner.login, repository.name, '.github/emass.json')

        core.info(`[${repository.name}]: Retrieving supported CodeQL languages`)
        const requiredLanguages = await listLanguages(octokit, repository.owner.login, repository.name, ignoredLanguages)

        if (!emassConfig || !emassConfig.systemOwnerEmail || !emassConfig.systemID || !systemIDs.includes(emassConfig.systemID)) {
            if(emassConfig && emassConfig.systemID && !systemIDs.includes(emassConfig.systemID)){
                core.warning(`[${repository.name}] [invalid-system-id] Skipping repository as it contains an invalid System ID`)
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
                await createIssue(octokit, repository.owner.login, repository.name, 'Error: GitHub Repository Not Mapped To eMASS System', issueBody)
            }

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
                    await createIssue(octokit, repository.owner.login, repository.name, 'GitHub Repository Code Scanning Software Is Out Of Date', body, ['out-of-date-codeql-cli'])
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
            FULLY_COMPLIANT_REPOS.push(repository.name)
            core.info(`[${repository.name}]: [successfully-processed] Successfully processed repository`)
            return
        }

        CONFIGURED_MISSING_SCANS_REPOS.push(repository.name)
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

        return Object.keys(languages).map(language => language.toLowerCase())
            .map(language => {
                if (language === 'kotlin') {
                    return 'java'
                }
                return language
            })
            .filter(language => supportedCodeQLLanguages.includes(language))
            .filter(language => !ignoredLanguages.includes(language))
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

        return databases.filter(async (database) => {
            return await validateCodeQLDatabase(octokit, database.created_at, range)
        }).map(database => database.language.toLowerCase())
    } catch (e) {
        throw new Error(`Failed to list CodeQL database languages: ${e.message}`)
    }
}

const validateCodeQLDatabase = async (octokit, createdAt, range) => {
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
    if(!DISABLE_NOTIFICATIONS) {
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
        await octokit.request('PUT /user/installations/{installation_id}/repositories/{repository_id}', {
            installation_id: installationID,
            repository_id: repositoryID
        })
    } catch (e) {
        throw new Error(`Failed to install app: ${e.message}`)
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
    if(!DISABLE_NOTIFICATIONS) {
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
        const {data: versions} = await client.request('GET https://api.github.com/repos/{owner}/{repo}/releases', {
            owner: 'github',
            repo: 'codeql-cli-binaries',
            per_page: 2
        })

        return versions.map(version => version.tag_name.split('v')[1])
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
        for (const issue of issues) {
            await octokit.issues.update({
                owner: owner,
                repo: repo,
                issue_number: issue.number,
                state: 'closed'
            })
        }
    } catch (e) {
        throw new Error(`Failed to close issues: ${e.message}`)
    }
}

const getFileRefSHA = async (octokit, owner, repo, branch, path) => {
    try {
        const {data: content} = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })

        return content.sha
    } catch (e) {
        if(e.status === 404) {
            throw new Error(`File not found: ${path}`)
        }

        throw new Error(`Failed to retrieve file SHA: ${e.message}`)
    }
}

const updateFile = async (octokit, owner, repo, branch, path, message, content, sha) => {
    try {
        await octokit.repos.createOrUpdateFileContents({
            owner: owner,
            repo: repo,
            path: path,
            message: message,
            content: Buffer.from(content).toString('base64'),
            sha: sha,
            branch: branch
        })
    } catch (e) {
        throw new Error(`Failed to update file: ${e.message}`)
    }
}

const createDashboardMarkdown = async() => {
    const enabled = FULLY_COMPLIANT_REPOS.length
    const enabledNonCompliant = CONFIGURED_MISSING_SCANS_REPOS.length
    const notEnabled = TOTAL_REPOS.length - FULLY_COMPLIANT_REPOS.length
    const table = markdownTable([
        ['Enabled', 'Enabled: Non-Compliant', 'Not Enabled'],
        [enabled, enabledNonCompliant, notEnabled]
    ])

    return `---
layout: minimal
title: Enablement Dashboard
nav_order: 60
parent: Code Scanning Governance Platform Dashboard
---

${table}
    `
}

main().catch(e => core.setFailed(e.message))
