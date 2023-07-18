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

/***/ 865:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


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

const core = __nccwpck_require__(385)
const yaml = __nccwpck_require__(865)
const {createGitHubAppClient} = __nccwpck_require__(816)
const main = async () => {
    try {
        const config = parseInput()

        core.info('Creating GitHub App Client')
        const octokit = await createGitHubAppClient(config.allowlist_credentials.appID, config.allowlist_credentials.privateKey)

        core.info('Create GitHub Client')
        const client = await octokit.getInstallationOctokit(config.allowlist_credentials.installationID)

        core.info(`[${config.repo}]: Retrieving mono-repo allowlist from ${config.org}/${config.allowlist_repo}/${config.allowlist_path}`)
        const allowlist = await getFileArray(client, config.org, config.allowlist_repo, config.allowlist_path)
        core.info(`[${config.repo}]: Validating repo has access to monorepo features`)
        if (!allowlist.includes(config.repo)) {
            core.setFailed(`[${config.repo}]: Configuration not allowed, repo not enabled for monorepo features, please add to allowlist: https://github.com/${config.org}/${config.allowlist_repo}/blob/main/${config.allowlist_path}`)
            process.exit(1)
        }

        core.info(`[${config.repo}]: Validated repo has access to monorepo features`)
    } catch (e) {
        core.setFailed(`Failed validating access: ${e.message}`)
    }
}

const parseInput = () => {
    const allowlist_credentials = core.getInput('allowlist_credentials', {
        required: true,
        trimWhitespace: true
    })
    const allowlist_path = core.getInput('allowlist_path', {
        required: true,
        trimWhitespace: true
    })
    const allowlist_repo = core.getInput('allowlist_repo', {
        required: true,
        trimWhitespace: true
    })
    const org = core.getInput('org', {
        required: true,
        trimWhitespace: true
    })
    const repo = core.getInput('repo', {
        required: true,
        trimWhitespace: true
    })

    return {
        allowlist_credentials: yaml.load(allowlist_credentials),
        allowlist_path: allowlist_path,
        allowlist_repo: allowlist_repo,
        org: org,
        repo: repo.toLowerCase()
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
        return yaml.load(content).repos
    } catch (e) {
        if (e.status === 404) {
            return new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
        }

        throw new Error(`failed retrieving ${path} for ${owner}/${repo}: ${e.message}`)
    }
}

main().catch(e => {
    core.setFailed(`Failed to bundle and upload database: ${e.message}`)
})

})();

module.exports = __webpack_exports__;
/******/ })()
;