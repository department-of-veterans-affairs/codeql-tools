const fs = require('fs')
const core = require('@actions/core')
const yaml = require('js-yaml')

const main = async () => {
    try {
        core.info('Parsing input')
        const buildStepName = core.getInput('build_step_name', {required: false, trimWhitespace: true})
        const language = core.getInput('language', {required: false, trimWhitespace: true})

        core.info('Checking for custom build steps')
        const fileExists = fs.existsSync('.github/codeql-config.yml')
        if (fileExists) {
            core.info('Found .github/codeql-config.yml')
            const key = buildStepName || language
            core.info(`Parsing build steps for key: ${key}`)
            if (key) {
                const yml = fs.readFileSync('.github/codeql-config.yml', 'utf8')
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
