import fs from 'fs'
import archiver from 'archiver'
import core from '@actions/core'
import {createCodeQLGitHubClient} from '../lib/utils.js'

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
