package internal

import (
	"fmt"

	"github.com/google/go-github/v52/github"
)

func (m *Manager) UpdateFile(owner, repo, branch, path, sha, message string, content []byte) error {
	_, _, err := m.MetricsGithubClient.Repositories.UpdateFile(m.Context, owner, repo, path, &github.RepositoryContentFileOptions{
		Branch:  &branch,
		Content: content,
		Message: &message,
		SHA:     &sha,
	})
	if err != nil {
		return fmt.Errorf("failed to update file: %v", err)
	}

	return nil
}
