// TODO: Add GitHub API versioning headers to all requests
const {App} = require('@octokit/app')
const {Octokit} = require('@octokit/rest')
const fetch = require('node-fetch').default
const {retry} = require('@octokit/plugin-retry')
const utils = require('@actions/github/lib/utils')
const {throttling} = require('@octokit/plugin-throttling')

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
    const retryingOctokit = utils.GitHub.plugin(retry)
    return new retryingOctokit({
        baseUrl: 'https://api.github.com',
        // TODO: Confirm the API's don't need a versioned user agent so we don't have to maintain this
        userAgent: 'CodeQL-Action/2.2.6',
    })
}

exports.createGitHubClient = (token) => {
    return new _Octokit({
        auth: token,
        throttle: throttlingOptions,
        request: {
            fetch: fetch
        }
    })
}

exports.createGitHubAppClient = async (id, privateKey) => {
    return new App({
        appId: id,
        privateKey: privateKey,
        Octokit: _Octokit.defaults({
            throttle: throttlingOptions,
            request: {
                fetch: fetch
            }
        })
    })
}
