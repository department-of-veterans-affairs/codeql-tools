const core = require('@actions/core')
const {Octokit} = require('@octokit/rest')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')

const org = core.getInput('ORG', {required: true, trimWhitespace: true})
const repo = core.getInput('REPO', {required: true, trimWhitespace: true})
const pullRequestNumber = core.getInput('PULL_REQUEST_NUMBER', {required: true, trimWhitespace: true})
const token = core.getInput('TOKEN', {required: true, trimWhitespace: true})

const _Octokit = Octokit.plugin(retry, throttling)
const client = new _Octokit({
    auth: token,
    throttle: {
        onRateLimit: (retryAfter, options, octokit) => {
            octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
            if (options.request.retryCount === 0) {
                octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                return true;
            }
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
            octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
        },
    }

})

const comment = async (org, repo, number, message) => {
    try {
        core.info(`Commenting on PR #${number}`)
        await client.issues.createComment({
            owner: org,
            repo: repo,
            issue_number: number,
            body: message
        })
    } catch (e) {
        core.setFailed(`Error commenting on PR #${number}: ${e.message}`)
        process.exit(0)
    }
}

const main = async () => {
    try {
        core.info('Checking if repository ignored')
        await client.repos.getContent({
            owner: org,
            repo: repo,
            path: '.github/.emass-repo-ignore'
        })
        core.info(`Repository is ignored, skipping CodeQL usage check`)
        process.exit(0)
    } catch (e) {
        if (e.status !== 404) {
            core.setFailed(`Error checking if repository is ignored: ${e.message}`)
            process.exit(0)
        }
        core.setFailed(`Error checking for CodeQL usage, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help: ${e.message}`)
        process.exit(0)
    }

    let analyses
    try {
        core.info(`Checking for CodeQL usage in ${org}/${repo}`)
        const response = await client.codeScanning.listRecentAnalyses({
            owner: org,
            repo: repo,
            tool_name: 'CodeQL',
            per_page: 1
        })
        analyses = response.data
    } catch (e) {
        core.info(`Status: ${e.status}`)
        if (e.status === 404) {
            const message = `Your repository is not in compliance with OIS requirements for CodeQL usage.
            
Your repository is not using CodeQL but has been identified as a repository required to perform code-scanning using CodeQL. Please refer to OIS guidance for configuring CodeQL: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage

If this pull request adds CodeQL to your repository, please ignore this message.

Please refer to OIS guidance for configuring CodeQL using the OIS approved libraries: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage

If you have additional questions about this comment, please open a ticket here: https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose`
            await comment(org, repo, pullRequestNumber, message)
            core.setFailed(`No CodeQL analyses found, please refer to OIS guidance for configuring CodeQL: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage`)
            process.exit(0)
        }
        core.setFailed(`Error checking for CodeQL usage, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help: ${e.message}`)
        process.exit(0)
    }
    core.info(`Found CodeQL analysis: ${analyses[0].url}`)

    try {
        if (!analyses[0].category.startsWith('ois')) {
            const message = `Your repository is not in compliance with OIS requirements for CodeQL usage.

Your repository is using CodeQL, but not using OIS approved code-scanning libraries.

Please refer to OIS guidance for configuring CodeQL using the OIS approved libraries: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage

If you have additional questions about this comment, please open a ticket here: https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose`
            await comment(org, repo, pullRequestNumber, message)
            core.setFailed(`CodeQL analysis found, but not using OIS approved code-scanning libraries. Please refer to OIS guidance for configuring CodeQL using the OIS approved libraries: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage`)
            process.exit(0)
        }
        core.info(`Repository is using OIS approved libraries: ${analyses[0].category}`)

        const analysisDate = new Date(analyses[0].created_at)
        const today = new Date()
        const diffTime = Math.abs(today - analysisDate)
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays > 7) {
            const message = `Your repository is not in compliance with OIS requirements for CodeQL usage. 
            
Your repository has not been scanned in the last 7 days. Please update your automation to run CodeQL analysis at least once weekly.

Please refer to OIS guidance for configuring CodeQL: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage`
            await comment(org, repo, pullRequestNumber, message)
            core.setFailed(`CodeQL analysis found, but it is older than 7 days. Please update your automation to run CodeQL analysis at least once weekly.`)
            process.exit(0)
        }
        core.info(`Recent, valid CodeQL analysis found: ${diffDays} days`)
    } catch (e) {
        core.setFailed(`Error checking for CodeQL usage, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help: ${e.message}`)
        process.exit(0)
    }
    core.info(`CodeQL usage checks successful, repository is in compliance.`)
}

main().catch(e => {
    core.setFailed(e.message)
    process.exit(0)
})