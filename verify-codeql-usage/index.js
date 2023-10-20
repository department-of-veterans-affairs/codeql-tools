const core = require('@actions/core')
const {Octokit} = require('@octokit/rest')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')

const org = core.getInput('ORG', {required: true, trimWhitespace: true})
const repo = core.getInput('REPO', {required: true, trimWhitespace: true})
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
        if(e.status !== 404) {
            core.setFailed(`Error checking if repository is ignored: ${e.message}`)
            process.exit(1)
        }
    }

    try {
        core.info(`Checking for CodeQL usage in ${org}/${repo}`)
        const {data: analyses} = await client.codeScanning.listRecentAnalyses({
            owner: org,
            repo: repo,
            tool_name: 'CodeQL',
            per_page: 1
        })

        if (analyses.length === 0) {
            core.setFailed(`No CodeQL analyses found, please refer to OIS guidance for configuring CodeQL: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage`)
            process.exit(1)
        }
        core.info(`Found CodeQL analysis: ${analyses[0].url}`)

        if (!analyses[0].category.startsWith('ois')) {
            core.setFailed(`CodeQL analysis found, but not using OIS approved code-scanning libraries. Please refer to OIS guidance for configuring CodeQL using the OIS approved libraries: https://department-of-veterans-affairs.github.io/ois-swa-wiki/docs/ghas/codeql-usage`)
            process.exit(1)
        }
        core.info(`Repository is using OIS approved libraries: ${analyses[0].category}`)

        const analysisDate = new Date(analyses[0].created_at)
        const today = new Date()
        const diffTime = Math.abs(today - analysisDate)
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays > 7) {
            core.setFailed(`CodeQL analysis found, but it is older than 7 days. Please update your automation to run CodeQL analysis at least once weekly.`)
            process.exit(1)
        }
        core.info(`Recent, valid CodeQL analysis found: ${diffDays} days`)
    } catch (e) {
        core.setFailed(`Error checking for CodeQL usage, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help: ${e.message}`)
        process.exit(1)
    }
    core.info(`CodeQL usage checks successful, repository is in compliance.`)
}

main()