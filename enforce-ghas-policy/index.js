const core = require('@actions/core')
const {Octokit} = require('@octokit/rest')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')

const org = core.getInput('ORG', {required: true, trimWhitespace: true})
const repo = core.getInput('REPO', {required: true, trimWhitespace: true})
const ref = core.getInput('REF', {required: true, trimWhitespace: true})
const messageViolation = core.getInput('MESSAGE_VIOLATION', {required: true, trimWhitespace: true})
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
    }

    try {
        core.info(`Retrieving high severity CodeQL Code Scanning alerts for ${org}/${repo}/${ref}`)
        const highAlerts = await client.paginate(client.codeScanning.listAlertsForRepo, {
            owner: org,
            repo: repo,
            ref: ref,
            severity: 'high',
            state: 'open',
            tool_name: 'CodeQL',
        })

        core.info(`Retrieving critical severity CodeQL Code Scanning alerts for ${org}/${repo}/${ref}`)
        const criticalAlerts = await client.paginate(client.codeScanning.listAlertsForRepo, {
            owner: org,
            repo: repo,
            ref: ref,
            severity: 'high',
            state: 'open',
            tool_name: 'CodeQL',
        })
        core.info(`Found ${highAlerts.length} high and ${criticalAlerts.length} critical alerts`)

        if (highAlerts.length > 0 || criticalAlerts.length > 0) {
            core.info(`Found ${highAlerts.length} high and ${criticalAlerts.length} critical alerts`)
            const message = messageViolation.replace('{highAlerts}', String(highAlerts.length)).replace('{criticalAlerts}', String(criticalAlerts.length))
            await comment(org, repo, pullRequestNumber, message)
            core.setFailed(`GHAS security policy violation found, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help.`)
            process.exit(1)
        }
    } catch (e) {
        core.setFailed(`Error checking for GHAS usage, please open a ticket here https://github.com/department-of-veterans-affairs/github-user-requests/issues/new/choose for additional help: ${e.message}`)
        process.exit(0)
    }
    core.info(`GHAS security policy check complete`)
}

main().catch(e => {
    core.setFailed(e.message)
    process.exit(0)
})