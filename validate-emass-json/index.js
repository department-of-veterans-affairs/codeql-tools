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
        const data = fs.readFileSync('.github/emass.json', 'utf8')
        const emass = JSON.parse(data)

        core.info('Validating eMASS System ID')
        const systemID = Number(emass.systemID)
        if(!isInteger(data) || (systemID <= 0 && systemID !== -1)) {
            core.setFailed(`eMASS System ID in .github/emass.json is not valid`)
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

const isInteger = (value) => {
    const regex = /"systemID"\s*:\s*["']?(-?\d+)["']?(?![.\d])/;
    return value.match(regex) !== null
}

main().catch(e => {
    core.setFailed(`Failed to validate emass.json: ${e.message}`)
})
