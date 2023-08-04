const core = require('@actions/core')
const fs = require('fs')

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
        if(Number(emass.systemID) <= 0) {
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
