/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 385:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 865:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


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
const core = __nccwpck_require__(385)
const yaml = __nccwpck_require__(865)

const main = async () => {
    try {
        core.info('Parsing input')
        const buildStepName = core.getInput('build_step_name', {required: false, trimWhitespace: true})
        const language = core.getInput('language', {required: false, trimWhitespace: true})

        core.info('Checking for custom build steps')
        const fileExists = fs.existsSync('.github/codeql.yml')
        if (fileExists) {
            core.info('Found .github/codeql.yml')
            const key = buildStepName || language
            core.info(`Parsing build steps for key: ${key}`)
            if (key) {
                const yml = fs.readFileSync('.github/codeql.yml', 'utf8')
                const config = yaml.load(yml)
                if (config.build_steps && config.build_steps[key]) {
                    core.info('Found custom build steps')
                    core.setOutput('result', config.build_steps[key])
                    return
                }
            }
        }
        console.info('No custom build steps found')
    } catch (e) {
        core.setFailed(`Failed evaluating custom build steps: ${e.message}`)
    }
}

main().catch(e => core.setFailed(e.message))

})();

module.exports = __webpack_exports__;
/******/ })()
;