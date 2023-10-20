/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 101:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 777:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-retry");


/***/ }),

/***/ 481:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-throttling");


/***/ }),

/***/ 611:
/***/ ((module) => {

module.exports = eval("require")("@octokit/rest");


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
const core = __nccwpck_require__(101)
const {Octokit} = __nccwpck_require__(611)
const {retry} = __nccwpck_require__(777)
const {throttling} = __nccwpck_require__(481)

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
            core.setFailed(`No CodeQL analyses found, please refer to OIS guidance for configuring CodeQL.`)
            process.exit(1)
        }

        if (!analyses[0].category.startsWith('ois')) {
            core.setFailed(`CodeQL analysis found, but not using OIS approved code-scanning libraries. Please refer to OIS guidance for configuring CodeQL using the OIS approved libraries.`)
            process.exit(1)
        }

        const analysisDate = new Date(analyses[0].created_at)
        const today = new Date()
        const diffTime = Math.abs(today - analysisDate)
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays > 7) {
            core.setFailed(`CodeQL analysis found, but it is older than 7 days. Please refer to OIS guidance for configuring CodeQL to run on a weekly basis.`)
            process.exit(1)
        }
    } catch (e) {
        core.setFailed(`Error checking for CodeQL usage, please open a ticket in github-user-requests repository for additional help: ${e.message}`)
        process.exit(1)
    }
}

main()
})();

module.exports = __webpack_exports__;
/******/ })()
;