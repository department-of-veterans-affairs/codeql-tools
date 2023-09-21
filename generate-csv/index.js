const fs = require('fs')
const path = require('path')
const core = require('@actions/core')

const main = async () => {
    const databaseName = core.getInput('database_name', {required: true, trimWhitespace: true})
    const outputPath = core.getInput('output_path', {required: true, trimWhitespace: true})
    const sarifPath = path.join('..', 'results', `${databaseName}.sarif`)

    core.info(`Reading SARIF file from ${sarifPath}`)
    const results = JSON.parse(fs.readFileSync(sarifPath, 'utf8'))
    const findings = []
    core.info('Processing SARIF file')
    for (const result of results.runs[0].results) {
        const index = result.rule.toolComponent.index
        const rules = results.runs[0].tool.extensions[index].rules
        const rule = rules.find(rule => rule.id === result.ruleId)
        const finding = {
            id: result.ruleId,
            severity: mapSeverityScore(rule.properties['security-severity']),
            short_description: rule.shortDescription.text,
            full_description: rule.fullDescription.text,
            file: result.locations[0].physicalLocation.artifactLocation.uri,
            startLine: result.locations[0].physicalLocation.region.startLine || 1,
            startColumn: result.locations[0].physicalLocation.region.startColumn || 1,
            endLine: result.locations[0].physicalLocation.region.endLine || result.locations[0].physicalLocation.region.startLine,
            endColumn: result.locations[0].physicalLocation.region.endColumn - 1 || result.locations[0].physicalLocation.region.startColumn
        }
        console.log(result.locations[0].physicalLocation.region)
        findings.push(finding)
    }

    core.info(`Generating CSV output`)
    const csv = 'id,severity,short_description,full_description,file,startLine,startColumn,endLine,endColumn\n' + findings.map(finding => {
        return `${finding.id},${finding.severity},"${finding.short_description}","${finding.full_description}","${finding.file}",${finding.startLine},${finding.startColumn},${finding.endLine},${finding.endColumn}`
    }).join('\n')

    core.info(`Writing CSV file to ${outputPath}`)
    await fs.writeFileSync(outputPath, csv)
}

const mapSeverityScore = (score) => {
    if (score < 0.1) {
        return 'None'
    } else if (score < 4) {
        return 'Low'
    } else if (score < 7) {
        return 'Medium'
    } else if (score < 9) {
        return 'High'
    } else {
        return 'Critical'
    }
}

main().catch(err => {
    core.error(`Failed to generate CSV: ${err.message}`)
})
