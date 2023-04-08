def call(org, repo, branch, language, buildCommand, token) {
    env.AUTHORIZATION_HEADER = "Authorization: token $token"
    env.BRANCH = branch
    env.BUILD_COMMAND = buildCommand
    env.DATABASE_BUNDLE = "$language-database.zip"
    env.DATABASE_PATH = "$repo-$language"
    env.GITHUB_TOKEN = token
    env.LANGUAGE = language
    env.ORG = org
    env.REPO = repo
    env.SARIF_FILE = sprintf("%s-%s.sarif", repo, language)

}
