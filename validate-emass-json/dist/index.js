/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 101:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


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
const core = __nccwpck_require__(101)
const fs = __nccwpck_require__(147)

const main = async () => {
    try {
        core.info('Checking if .github/emass.json exists')
        if (!fs.existsSync('.github/emass.json')) {
            core.setFailed('.github/emass.json does not exist')
            process.exit(1)
        }

        core.info('Retrieving local emass data')
        const emass = JSON.parse(fs.readFileSync('.github/emass.json', 'utf8'))

        core.info('Validating eMASS System ID')
        if(Number(emass.systemID) <= 0 && Number(emass.systemID) !== -1) {
            core.setFailed(`eMASS System ID '${emass.systemID}' is not valid`)
            process.exit(1)
        }

        core.info('Validating eMASS System Owner Email')
        if(!emass.systemOwnerEmail.includes('@')) {
            core.setFailed(`eMASS System Owner Email '${emass.systemOwnerEmail}' is not valid`)
            process.exit(1)
        }
    } catch (e) {
        core.setFailed(`Failed validating emass.json: ${e.message}`)
    }
}

main().catch(e => {
    core.setFailed(`Failed to validate emass.json: ${e.message}`)
})

})();

module.exports = __webpack_exports__;
/******/ })()
;