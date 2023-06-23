package internal

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/go-github/v52/github"
)

func (m *Manager) GetEMASSConfig(owner, repo string) (*EMASSConfig, error) {
	content, _, resp, err := m.MetricsGithubClient.Repositories.GetContents(m.Context, owner, repo, ".github/emass.json", &github.RepositoryContentGetOptions{})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return nil, nil
		}

		return nil, fmt.Errorf("failed to get file: %v", err)
	}

	decodedContent, err := content.GetContent()
	if err != nil {
		return nil, fmt.Errorf("failed to decode file content: %v", err)
	}

	var config EMASSConfig
	err = json.Unmarshal([]byte(decodedContent), &config)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal file content: %v", err)
	}

	return &config, nil
}

func (m *Manager) GetCodeQLConfig(owner, repo, path string) (*CodeQLConfig, error) {
	content, _, resp, err := m.MetricsGithubClient.Repositories.GetContents(m.Context, owner, repo, path, &github.RepositoryContentGetOptions{})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return &CodeQLConfig{
				BuildCommands:     map[string]string{},
				ExcludedLanguages: []string{},
			}, nil
		}

		return nil, fmt.Errorf("failed to get file: %v", err)
	}

	decodedContent, err := content.GetContent()
	if err != nil {
		return nil, fmt.Errorf("failed to decode file content: %v", err)
	}

	var config CodeQLConfig
	err = json.Unmarshal([]byte(decodedContent), &config)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal file content: %v", err)
	}

	return &config, nil
}

func (m *Manager) GetEMASSSystemList(owner, repo, path string) ([]int64, error) {
	content, _, resp, err := m.MetricsGithubClient.Repositories.GetContents(m.Context, owner, repo, path, &github.RepositoryContentGetOptions{})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("file not found")
		}

		return nil, fmt.Errorf("failed to get file: %v", err)
	}

	decodedContent, err := content.GetContent()
	if err != nil {
		return nil, fmt.Errorf("failed to decode file content: %v", err)
	}

	var ids []int64
	trimmedContent := strings.TrimSpace(decodedContent)
	lines := strings.Split(trimmedContent, "\n")
	for _, line := range lines {
		trimmedLine := strings.TrimSpace(line)
		if !strings.Contains(trimmedLine, "#") {
			id, err := strconv.ParseInt(trimmedLine, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("failed to parse system ID: %v", err)
			}
			ids = append(ids, id)
		}
	}

	return ids, nil
}

func (m *Manager) GetLatestCodeQLVersions() (*CodeQLDefaultVersions, error) {
	content, _, resp, err := m.AdminGitHubClient.Repositories.GetContents(m.Context, "github", "codeql-action", "src/defaults.json", &github.RepositoryContentGetOptions{})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("CodeQL defaults.json not found")
		}
		return nil, fmt.Errorf("failed to list releases: %v", err)
	}

	rawContent, err := content.GetContent()
	if err != nil {
		return nil, fmt.Errorf("failed to decode file content: %v", err)
	}

	var defaults CodeQLDefaultVersions
	err = json.Unmarshal([]byte(rawContent), &defaults)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal file content: %v", err)
	}

	return &defaults, nil
}

func (m *Manager) GetFile(org, repo, branch, path string) (*Report, string, error) {
	results, _, resp, err := m.MetricsGithubClient.Repositories.GetContents(m.Context, org, repo, path, &github.RepositoryContentGetOptions{
		Ref: branch,
	})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return nil, "", fmt.Errorf("%s not found", path)
		}
		return nil, "", fmt.Errorf("failed to retrieve repo contents: %v", err)
	}

	rawContent, err := results.GetContent()
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode file content: %v", err)
	}

	var metrics Report
	err = json.Unmarshal([]byte(rawContent), &metrics)

	return &metrics, results.GetSHA(), nil
}
