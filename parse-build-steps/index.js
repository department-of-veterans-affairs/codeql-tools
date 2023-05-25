const fs = require('fs')
const core = require('@actions/core')
const yaml = require('js-yaml')

const main = async () => {
    try {
        core.info('Checking for custom build steps')
        const fileExists = fs.existsSync('.github/codeql-config.yml')
        if (fileExists) {
            core.info('Found .github/codeql-config.yml')
            const language = process.env.build_step_name || process.env.language
            core.info(`Parsing build steps for key: ${language}`)
            if (language) {
                const yml = fs.readFileSync('.github/codeql-config.yml', 'utf8')
                const config = yaml.load(yml)
                if (config.build_steps && config.build_steps[language]) {
                    core.info('Found custom build steps')
                    core.setOutput('build-steps', config.build_steps[language])
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
