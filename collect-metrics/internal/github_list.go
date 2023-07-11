package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/department-of-veterans-affairs/codeql-tools/utils"
	"github.com/google/go-github/v53/github"
)

func (m *Manager) ListRepos() ([]*github.Repository, error) {
	opts := &github.ListOptions{
		PerPage: 100,
	}

	var repos []*github.Repository
	for {
		installations, resp, err := m.VerifyScansGithubClient.Apps.ListRepos(m.Context, opts)
		if err != nil {
			return nil, fmt.Errorf("failed to list repositories: %v", err)
		}
		repos = append(repos, installations.Repositories...)

		if resp.NextPage == 0 {
			break
		}

		opts.Page = resp.NextPage
	}

	return repos, nil
}

func (m *Manager) ListExpectedCodeQLLanguages(owner, repo string, ignoredLanguages []string) ([]string, error) {
	languages, _, err := m.MetricsGithubClient.Repositories.ListLanguages(m.Context, owner, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to list languages: %v", err)
	}

	var supportedLanguages []string
	mappedLanguages := MapLanguages(languages)
	for _, language := range mappedLanguages {
		if !Includes(ignoredLanguages, language) {
			if utils.IsSupportedCodeQLLanguage(language) {
				supportedLanguages = append(supportedLanguages, language)
			}
		}
	}

	return supportedLanguages, nil
}

func (m *Manager) ListCodeQLDatabaseLanguages(owner, repo string) ([]string, error) {
	databaseAPIEndpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/code-scanning/codeql/databases", owner, repo)
	apiURL, err := url.Parse(databaseAPIEndpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to parse url: %v", err)
	}

	var databases []codeQLDatabase
	request := &http.Request{
		Method: http.MethodGet,
		URL:    apiURL,
	}
	response, err := m.MetricsGithubClient.Do(m.Context, request, &databases)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get databases: %v", err)
	}

	var languages []string
	for _, database := range databases {
		if m.IsDateInRange(database.CreatedAt) {
			languages = append(languages, database.Language)
		}
	}

	return languages, nil
}

func (m *Manager) ListCodeQLAnalyses(owner, repo, branch string, requiredLanguages []string) (*Analyses, error) {
	page := 0
	results := &Analyses{}
	endpoint := "https://api.github.com/repos/%s/%s/code-scanning/analyses?per_page=100&page=%d"
	for {
		page++
		analysesAPIEndpoint := fmt.Sprintf(endpoint, owner, repo, page)
		apiURL, err := url.Parse(analysesAPIEndpoint)
		if err != nil {
			return nil, fmt.Errorf("failed to parse url: %v", err)
		}

		requestBody := &analysisRequest{
			ToolName:  "CodeQL",
			Ref:       fmt.Sprintf("refs/heads/%s", branch),
			Direction: "desc",
			Sort:      "created",
		}
		requestJSON, err := json.Marshal(requestBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %v", err)
		}

		var analysesResults []analysisResult
		request := &http.Request{
			Method: http.MethodGet,
			URL:    apiURL,
			Body:   io.NopCloser(bytes.NewReader(requestJSON)),
		}
		response, err := m.MetricsGithubClient.Do(m.Context, request, &analysesResults)
		if err != nil {
			if response.StatusCode == http.StatusNotFound {
				return &Analyses{
					Languages: []string{},
					Versions:  []string{},
				}, nil
			}
			return nil, fmt.Errorf("failed to make request: %v", err)
		}
		if response.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("failed to get databases: %v", err)
		}

		if len(analysesResults) == 0 {
			break
		}

		done := false
		for _, analysis := range analysesResults {
			if !m.IsDateInRange(analysis.CreatedAt) {
				done = true
				continue
			}
			if strings.HasPrefix(analysis.Category, "ois-") {
				language := strings.TrimPrefix(analysis.Category, "ois-")
				language = strings.Split(language, "-")[0]
				analysis.Language = strings.ToLower(language)
				if !Includes(results.Languages, analysis.Language) {
					results.Languages = append(results.Languages, analysis.Language)
					results.Versions = append(results.Versions, analysis.Tool.Version)
				}
				complete := AllRequiredAnalysesFound(results.Languages, requiredLanguages)
				if complete {
					m.Logger.Infof("Found all required analyses, stopping search")
					return results, nil
				}
			}
		}

		if done {
			break
		}

	}

	return results, nil
}
