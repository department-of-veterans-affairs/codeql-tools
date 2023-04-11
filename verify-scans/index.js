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
const {createGitHubAppClient, supportedCodeQLLanguages, createGitHubClient} = require('../lib/utils')

axiosRetry(axios, {
    retries: 3
})

const SOURCE_REPO = 'department-of-veterans-affairs/codeql-tools'

const main = async () => {
    // TODO: Flag failures in upload/download
    const skippedIgnored = []
    const missing = {}
    const emassMissing = []
    const notified = []

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

    core.info('Instantiating emass-promotion GitHub App client')
    const verifyScansApp = await createGitHubAppClient(config.verify_scans_app_id, config.verify_scans_private_key)

    core.info('Instantiating emass-promotion GitHub App client')
    const emassPromotionApp = await createGitHubAppClient(config.emass_promotion_app_id, config.emass_promotion_private_key)

    core.info('Creating EMASS Promotion installation client')
    const emassPromotionInstallationClient = await emassPromotionApp.getInstallationOctokit(config.emass_promotion_installation_id)

    await verifyScansApp.eachRepository(async ({octokit, repository}) => {
        try {
            core.info(`Retrieving .emass-ignore file for ${repository.name}`)
            const emassIgnore = await getFile(octokit, repository.owner.login, repository.name, '.emass-ignore')
            if (emassIgnore) {
                core.info(`Found .emass-ignore file for ${repository.name}, skipping repository`)
                skippedIgnored.push(repository.name)
                return
            }

            core.info(`Retrieving codeql-config.yml file for ${repository.name}`)
            let codeqlConfig
            let ignoredLanguages = []
            const _codeqlConfig = await getFile(octokit, repository.owner.login, repository.name, '.github/codeql-config.yml')
            if (_codeqlConfig) {
                core.info(`Found codeql-config.yml file for ${repository.name}, parsing file`)
                codeqlConfig = yaml.load(_codeqlConfig)

                core.info(`Parsing ignored languages for ${repository.name}`)
                ignoredLanguages = codeqlConfig.excluded_languages.map(language => language.name.toLowerCase())
            }


            core.info(`Retrieving supported CodeQL languages for ${repository.name}`)
            const requiredLanguages = await listLanguages(octokit, repository.owner.login, repository.name, ignoredLanguages)

            core.info(`Retrieving analyses for ${repository.name}`)
            const analysesLanguages = await listCodeQLAnalysesLanguages(octokit, repository.owner.login, repository.name, repository.default_branch, config.days_to_scan)
            if (analysesLanguages.length > 0) {
                core.info(`Analyses found for ${repository.name}, validating EMASS Promotion app is installed on repository`)
                const installed = await isAppInstalled(emassPromotionInstallationClient, repository.owner.login, repository.name)
                if (!installed) {
                    core.info(`App not installed for ${repository.name}, installing app on repository`)
                    await installApp(adminClient, config.emass_promotion_installation_id, repository.id)
                }
            }

            core.info(`Calculating missing analyses languages for ${repository.name}`)
            const missingAnalyses = await missingLanguages(requiredLanguages, analysesLanguages)

            core.info(`Retrieving CodeQL database languages for ${repository.name}`)
            const databaseLanguages = await listCodeQLDatabaseLanguages(octokit, repository.owner.login, repository.name, config.days_to_scan)

            core.info(`Calculating missing database languages for ${repository.name}`)
            const missingDatabases = await missingLanguages(requiredLanguages, databaseLanguages)

            if (missingAnalyses.length === 0 && missingDatabases.length === 0) {
                core.info(`No missing analyses or databases found for ${repository.name}`)
                return
            }

            missing[repository.name] = {
                missingAnalyses: missingAnalyses,
                missingDatabases: missingDatabases
            }

            core.info(`Missing analyses or databases found for ${repository.name}: ${JSON.stringify(missing[repository.name])}`)
            const emassConfig = await getFile(octokit, repository.owner.login, repository.name, '.github/emass.json')

            const uniqueMissingLanguages = [...new Set([...missingAnalyses, ...missingDatabases])]
            const repoURL = `https://github.com/${repository.owner.login}/${repository.name}`


            // TODO: Validate EMASS ID is valid
            if (!emassConfig || !emassConfig.systemOwnerEmail) {
                core.info(`No .github/emass.json file found for ${repository.name}`)
                emassMissing.push(repository.name)

                core.info(`Sending email to SWA for ${repository.name}`)
                const body = generateMissingEMASSInfoEmail(config.missing_info_email_template, repoURL, uniqueMissingLanguages)
                await sendEmail(mailer, config.gmail_from, config.gmail_from, 'Error: GitHub Repository Not Mapped To eMASS System ', body)

                const emassMissingIssueExists = await issueExists(octokit, repository.owner.login, repository.name, 'ghas-non-compliant')
                if (!emassMissingIssueExists) {
                    core.info(`Creating issue for ${repository.name}`)
                    const issueBody = generateMissingEMASSInfoIssue(config.missing_info_issue_template, repoURL, uniqueMissingLanguages)
                    await createIssue(octokit, repository.owner.login, repository.name, 'Error: GitHub Repository Not Mapped To eMASS System', issueBody)
                }

                return
            }

            core.info(`Generating Non-Compliant email body`)
            const body = generateNonCompliantEmailBody(config.non_compliant_email_template, emassConfig.systemID, emassConfig.systemID, repoURL, uniqueMissingLanguages)

            core.info(`Sending email to system owner for ${repository.name}`)
            await sendEmail(mailer, config.gmail_from, config.gmail_from, 'GitHub Repository Code Scanning Not Enabled', body)
            notified.push(repository.name)
        } catch (error) {
            core.error(`Error processing ${repository.name}: ${error}`)
        }
    })

    core.info('Finished processing all repositories, generating summary')
    // TODO: Create shared utility function to generate markdown summary report
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
            verify_scans_app_id: verify_scans_app_id,
            verify_scans_private_key: verify_scans_private_key,
            verify_scans_installation_id: verify_scans_installation_id
        }
    } catch (e) {
        core.setFailed(`Failed to parse input: ${e.message}`)
        process.exit(1)
    }
}

const getFile = async (octokit, owner, repo, path) => {
    try {
        const response = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path
        })
        return JSON.parse(Buffer.from(response.data.content, 'base64').toString())
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

const listCodeQLAnalysesLanguages = async (octokit, owner, repo, branch, range) => {
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
        const languages = []
        for (const analysis of analyses) {
            const environment = JSON.parse(analysis.environment)
            const language = environment.language
            if (!languages.includes(language)) {
                languages.push(language)
            }
        }

        return languages
    } catch
        (e) {
        if (e.status === 404) {
            return []
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

// TODO: Add logic for generating emails after determining email body language
const sendEmail = async (client, from, emails, subject, html) => {
    console.log(`Sending email to ${emails} from ${from}`)
    await client.sendMail({
        from: from,
        to: emails,
        replyTo: from,
        subject: subject,
        html: html
    })
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

const createIssue = async (octokit, owner, repo, title, body) => {
    try {
        await octokit.issues.create({
            owner: owner,
            repo: repo,
            title: title,
            body: body,
            labels: ['ghas-non-compliant']
        })
    } catch (e) {
        throw new Error(`Failed to create issue: ${e.message}`)
    }
}

const reusableWorkflowInUse = async (octokit, owner, repo, branch, path) => {
    try {
        const {data: workflow} = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: branch
        })
        const decodedContent = Buffer.from(workflow.content, 'base64').toString('utf-8')

        return decodedContent.includes(SOURCE_REPO)
    } catch (e) {
        if (e.status === 404) {
            return false
        }
        throw e
    }
}

main().catch(e => core.setFailed(e.message))
