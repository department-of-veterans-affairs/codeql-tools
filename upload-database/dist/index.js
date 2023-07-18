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

/***/ 777:
/***/ ((module) => {

module.exports = eval("require")("archiver");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

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
const fs = __nccwpck_require__(147)
const archiver = __nccwpck_require__(777)
const core = __nccwpck_require__(385)
const {createCodeQLGitHubClient} = __nccwpck_require__(816)
const main = async () => {
    try {
        const config = parseInput()
        const file = `${config.language}-database.zip`
        try {
            const output = fs.createWriteStream(file)
            const archive = archiver('zip')
            archive.pipe(output)
            archive.directory(config.path)
            core.info(`Generating database bundle ${file}`)
            await archive.finalize()
            core.info(`Database successfully generated`)
        } catch (e) {
            core.setFailed(`Unable to create zip file from database: ${e.message}`)
            return
        }

        core.info(`Uploading database ${file}`)
        const octokit = createCodeQLGitHubClient()
        const bundledDbSize = fs.statSync(file).size
        core.info(`Bundle size: ${bundledDbSize}`)
        const bundledDbReadStream = fs.createReadStream(file)
        await octokit.request(`POST https://uploads.github.com/repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name`, {
                owner: config.org,
                repo: config.repo,
                language: config.language,
                name: file,
                data: bundledDbReadStream,
                headers: {
                    "authorization": `token ${config.token}`,
                    "Content-Type": "application/zip",
                    "Content-Length": bundledDbSize,
                },
            }
        )
        core.info(`Successfully uploaded file ${file}`)
    } catch (e) {
        core.setFailed(`Unable to upload database: ${e.message}`)
    }
}

const parseInput = () => {
    const language = core.getInput('language', {
        required: true,
        trimWhitespace: true
    })
    const org = core.getInput('org', {
        required: true,
        trimWhitespace: true
    })
    const path = core.getInput('path', {
        required: true,
        trimWhitespace: true
    })
    const repo = core.getInput('repo', {
        required: true,
        trimWhitespace: true
    })
    const token = core.getInput('token', {
        required: true,
        trimWhitespace: true
    })

    return {
        language: language,
        org: org,
        path: path,
        repo: repo,
        token: token
    }
}

main().catch(e => {
    core.setFailed(`Failed to bundle and upload database: ${e.message}`)
})

})();

module.exports = __webpack_exports__;
/******/ })()
;