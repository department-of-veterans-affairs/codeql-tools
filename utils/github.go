package utils

import (
	"context"
	"fmt"
	"net/http"

	"github.com/bradleyfalzon/ghinstallation/v2"
	"github.com/google/go-github/v52/github"
	"golang.org/x/oauth2"
)

func NewGitHubClient(token string) *github.Client {
	ctx := context.Background()
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(ctx, ts)

	return github.NewClient(tc)
}

func NewGitHubAppClient(appID int64, privateKey []byte) (*github.Client, error) {
	itr, err := ghinstallation.NewAppsTransport(http.DefaultTransport, appID, privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create GitHub App transport: %v", err)
	}

	return github.NewClient(&http.Client{Transport: itr}), nil
}

func NewGitHubInstallationClient(appID int64, installationID int64, privateKey []byte) (*github.Client, error) {
	itr, err := ghinstallation.New(http.DefaultTransport, appID, installationID, privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create GitHub App transport: %v", err)
	}

	return github.NewClient(&http.Client{Transport: itr}), nil
}
