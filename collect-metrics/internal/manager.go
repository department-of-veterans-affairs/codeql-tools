package internal

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/go-github/v52/github"
	log "github.com/sirupsen/logrus"
)

type Manager struct {
	Context context.Context

	AdminGitHubClient       *github.Client
	MetricsGithubClient     *github.Client
	VerifyScansGithubClient *github.Client

	Config       *Input
	Logger       *log.Entry
	GlobalLogger *log.Logger

	EMASSSystemIDs       []int64
	LatestCodeQLVersions []string
	MonorepoList         *RepoList
}

func (m *Manager) ProcessRepository(repo *github.Repository) (*State, error) {
	logger := m.GlobalLogger.WithField("repo", repo.GetName())
	m.Logger = logger

	org := repo.GetOwner().GetLogin()
	name := repo.GetName()
	defaultBranch := repo.GetDefaultBranch()

	logger.Infof("Processing repository")
	state := &State{
		MissingAnalyses:  []string{},
		MissingDatabases: []string{},
	}

	logger.Infof("Checking if repository is archived")
	archived := repo.GetArchived()
	if archived {
		logger.Infof("Repository archived")
		state.Archived = true
		return state, nil
	}
	logger.Debugf("Repository not archived")

	logger.Infof("Checking if repository ignored")
	exists, err := m.FileExists(org, name, ".github/.emass-repo-ignore")
	if err != nil {
		return nil, fmt.Errorf("failed retrieving .emass-repo-ignore")
	}
	if exists {
		logger.Infof("Repository ignored")
		state.Ignored = true
		return state, nil
	}
	logger.Debugf("Repository not ignored")

	logger.Infof("Retrieving emass.json")
	emassConfig, err := m.GetEMASSConfig(org, name)
	if err != nil {
		return nil, fmt.Errorf("failed retrieving emass.json")
	}
	if emassConfig == nil {
		logger.Infof("Repository emass.json missing")
		state.EMASSConfigMissing = true
		state.SystemIDMissing = true
		state.SystemOwnerEmailMissing = true
	} else {
		logger.Debugf("Retrieved emass.json")

		logger.Infof("Validating emass.json")
		if emassConfig.SystemID == 0 {
			logger.Infof("Repository emass.json contains invalid System ID")
			state.SystemIDMissing = true
		}
		if !strings.Contains(strings.ToLower(emassConfig.SystemOwnerEmail), "@") {
			logger.Infof("Repository emass.json missing System Owner email")
			state.SystemOwnerEmailMissing = true
		}
	}

	logger.Infof("Retrieving CodeQL Configuration File")
	codeqlConfig, err := m.GetCodeQLConfig(org, name, defaultBranch)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve CodeQL Configuration File, skipping repo: %v", err)
	}
	logger.Debugf("CodeQL Configuration File retrieved")

	logger.Infof("Retrieving supported CodeQL languages")
	expectedLanguages, err := m.ListExpectedCodeQLLanguages(org, name, codeqlConfig.ExcludedLanguages)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve supported CodeQL languages, skipping repo: %v", err)
	}
	logger.Debugf("Supported CodeQL languages retrieved")

	logger.Info("Retrieving recent CodeQL analyses")
	recentAnalyses, err := m.ListCodeQLAnalyses(org, name, defaultBranch, expectedLanguages)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve recent CodeQL analyses, skipping repo: %v", err)
	}
	logger.Debugf("Recent CodeQL analyses retrieved")

	logger.Info("Validating scans performed with latest CodeQL version")
	if len(recentAnalyses.Versions) > 0 {
		for _, version := range recentAnalyses.Versions {
			if !Includes(m.LatestCodeQLVersions, version) {
				state.CLIVersionInvalid = true
			}
		}
	}
	logger.Debugf("CodeQL CLI versions validated")

	logger.Infof("Retrieving missing CodeQL languages")
	missingLanguages := CalculateMissingLanguages(expectedLanguages, recentAnalyses.Languages)
	logger.Debugf("Missing CodeQL languages retrieved: %v", missingLanguages)

	logger.Infof("Retrieving support CodeQL database languags")
	databaseLanguages, err := m.ListCodeQLDatabaseLanguages(org, name)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve supported CodeQL database languages, skipping repo: %v", err)
	}
	logger.Debugf("Supported CodeQL database languages retrieved")

	logger.Infof("Calculating missing CodeQL database languages")
	missingDatabaseLanguages := CalculateMissingLanguages(expectedLanguages, databaseLanguages)
	logger.Debugf("Missing CodeQL database languages calculated: %v", missingDatabaseLanguages)

	logger.Infof("Checking if repository monorepo")
	isMonorepo := Includes(m.MonorepoList.Repos, repo.GetName())
	if isMonorepo {
		state.Monorepo = true
	}
	logger.Debugf("Repository monorepo status checked")

	state.MissingAnalyses = missingLanguages
	if missingLanguages == nil {
		state.MissingAnalyses = []string{}
	}

	state.MissingDatabases = missingDatabaseLanguages
	if missingDatabaseLanguages == nil {
		state.MissingDatabases = []string{}
	}

	for _, language := range state.MissingAnalyses {
		state.MissingDatabases = append(state.MissingDatabases, language)
	}
	state.MissingDatabases = uniqueValues(state.MissingDatabases)

	return state, nil
}