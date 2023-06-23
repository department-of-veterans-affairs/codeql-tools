package internal

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/go-github/v52/github"
)

func (m *Manager) FileExists(owner, repo, path string) (bool, error) {
	_, _, resp, err := m.MetricsGithubClient.Repositories.GetContents(m.Context, owner, repo, path, &github.RepositoryContentGetOptions{})
	if err != nil {
		if resp.StatusCode == http.StatusNotFound {
			return false, nil
		}

		return false, fmt.Errorf("failed to get file: %v", err)
	}

	return true, nil
}

func CalculateMissingLanguages(expectedLanguages, actualLanguages []string) []string {
	var missingLanguages []string
	for _, language := range expectedLanguages {
		if !Includes(actualLanguages, language) {
			missingLanguages = append(missingLanguages, language)
		}
	}

	return missingLanguages
}

func MapLanguages(languages map[string]int) []string {
	mappedLanguages := make([]string, len(languages))
	for language := range languages {
		switch language {
		case "c":
		case "c++":
			mappedLanguages = append(mappedLanguages, "cpp")
		case "c#":
			mappedLanguages = append(mappedLanguages, "csharp")
		case "kotlin":
			mappedLanguages = append(mappedLanguages, "java")
		case "typescript":
			mappedLanguages = append(mappedLanguages, "javascript")
		default:
			mappedLanguages = append(mappedLanguages, strings.ToLower(language))
		}
	}

	return uniqueValues(mappedLanguages)
}

func Includes(a []string, s string) bool {
	for _, value := range a {
		if strings.TrimSpace(strings.ToLower(value)) == strings.TrimSpace(strings.ToLower(s)) {
			return true
		}
	}

	return false
}

func uniqueValues(input []string) []string {
	seen := make(map[string]struct{})
	var result []string
	for _, value := range input {
		if _, found := seen[value]; !found {
			seen[value] = struct{}{}
			result = append(result, value)
		}
	}

	return result
}

func (m *Manager) IsDateInRange(createdAt time.Time) bool {
	currentDate := time.Now()
	diff := currentDate.Sub(createdAt)
	diffDays := int(diff.Hours() / 24)

	return diffDays <= m.Config.DaysToScan
}

func AllRequiredAnalysesFound(languages, requiredLanguages []string) bool {
	for _, language := range requiredLanguages {
		if !Includes(languages, language) {
			return false
		}
	}

	return true
}
