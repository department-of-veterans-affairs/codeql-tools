const core = require('@actions/core')

/**
 * Parse the input from the workflow file
 * @returns {{configure_codeql_privateKey: string, verify_scans_id: number, org: string, configure_codeql_installationID: number, verify_scans_privateKey: string, repo: string, configure_codeql_id: number, verify_scans_installationID: number, admin_token: string, pull_request_body: string}}
 *
 * @throws {Error} - Throws an error if the input is invalid
 */
exports.parseInput = () => {
    try {
        const admin_token = core.getInput('admin_token', {
            required: true, trimWhitespace: true
        })
        const configure_codeql_id = Number(core.getInput('ghas_configure_codeql_app_id', {
            required: true, trimWhitespace: true
        }))
        const configure_codeql_privateKey = core.getInput('ghas_configure_codeql_private_key', {
            required: true, trimWhitespace: true
        })
        const configure_codeql_installationID = Number(core.getInput('ghas_configure_codeql_installation_id', {
            required: true, trimWhitespace: true
        }))
        const org = core.getInput('org', {
            required: true, trimWhitespace: true
        })
        const pull_request_body = core.getInput('pull_request_body', {
            required: true, trimWhitespace: true
        })
        const repo = core.getInput('repo', {
            required: false, trimWhitespace: true
        })
        const verify_scans_id = Number(core.getInput('ghas_verify_scans_app_id', {
            required: true, trimWhitespace: true
        }))
        const verify_scans_private_key = core.getInput('ghas_verify_scans_private_key', {
            required: true, trimWhitespace: true
        })
        const verify_scans_installationID = Number(core.getInput('ghas_verify_scans_installation_id', {
            required: true, trimWhitespace: true
        }))

        return {
            org: org,
            admin_token: admin_token,
            configure_codeql_id: configure_codeql_id,
            configure_codeql_privateKey: configure_codeql_privateKey,
            configure_codeql_installationID: configure_codeql_installationID,
            pull_request_body: pull_request_body,
            repo: repo,
            verify_scans_id: verify_scans_id,
            verify_scans_privateKey: verify_scans_private_key,
            verify_scans_installationID: verify_scans_installationID
        }
    } catch (e) {
        core.setFailed(`Failed to parse input: ${e.message}`)
        process.exit(1)
    }
}
