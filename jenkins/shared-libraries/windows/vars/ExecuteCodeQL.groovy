def call(Org, Repo, Branch, Language, BuildCommand, Token) {
    env.AUTHORIZATION_HEADER = sprintf("Authorization: token %s", Token)
    if(Branch == "") {
        // TODO: This doesn't work if branch includes a slash in it, split and reform based on branch name
        env.BRANCH = env.GIT_BRANCH.split('/')[1]
    } else {
        env.BRANCH = Branch
    }
    env.BUILD_COMMAND = BuildCommand
    env.DATABASE_BUNDLE = sprintf("%s-database.zip", Language)
    env.DATABASE_PATH = sprintf("%s-%s", Repo, Language)
    env.GITHUB_TOKEN = Token
    env.LANGUAGE = Language
    env.ORG = Org
    env.REPO = Repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", Repo, Language)

    powershell """

        Write-Output "https://uploads.github.com/repos/\$Env:ORG/\$Env:REPO/code-scanning/codeql/databases/\$Env:LANGUAGE?name=\$Env:DATABASE_BUNDLE"

    """

}
