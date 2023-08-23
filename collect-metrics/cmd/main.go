package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/department-of-veterans-affairs/codeql-tools/collect-metrics/internal"
	"github.com/department-of-veterans-affairs/codeql-tools/utils"
	"github.com/sirupsen/logrus"
)

type CustomFormatter struct{}

func (f *CustomFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	if repoValue, ok := entry.Data["repo"]; ok {
		repo := fmt.Sprint(repoValue)
		if eventValue, ok := entry.Data["event"]; ok {
			event := fmt.Sprint(eventValue)
			return []byte(fmt.Sprintf("[%s]: [%s] %s\n", repo, event, entry.Message)), nil
		}
		return []byte(fmt.Sprintf("[%s]: %s\n", repo, entry.Message)), nil
	}

	return []byte(fmt.Sprintf("%s\n", entry.Message)), nil
}

func main() {
	config := internal.ParseInput()

	globalLogger := logrus.New()
	globalLogger.SetFormatter(&CustomFormatter{})
	globalLogger.SetLevel(logrus.InfoLevel)
	debug := strings.ToLower(strings.TrimSpace(os.Getenv("DEBUG"))) == "true"
	if debug {
		globalLogger.SetLevel(logrus.DebugLevel)
	}

	adminClient := utils.NewGitHubClient(config.AdminToken)

	globalLogger.Infof("Creating Metric GitHub App client")
	metricsClient, err := utils.NewGitHubInstallationClient(config.MetricsAppID, config.MetricsAppInstallationID, config.MetricsAppPrivateKey)
	if err != nil {
		globalLogger.Fatalf("failed to create eMASS Promotion GitHub App client: %v", err)
	}
	globalLogger.Debugf("eMASS Promotion GitHub App client created")

	globalLogger.Infof("Creating Verify Scans GitHub App Installation client")
	verifyScansClient, err := utils.NewGitHubInstallationClient(config.VerifyScansAppID, config.VerifyScansInstallationID, config.VerifyScansPrivateKey)
	if err != nil {
		globalLogger.Fatalf("failed to create Verify Scans GitHub App client: %v", err)
	}
	globalLogger.Debugf("Verify Scans GitHub App client created")

	m := &internal.Manager{
		Context: context.Background(),

		AdminGitHubClient:       adminClient,
		MetricsGithubClient:     metricsClient,
		VerifyScansGithubClient: verifyScansClient,

		Config:       config,
		GlobalLogger: globalLogger,
	}

	globalLogger.Infof("Retrieving latest CodeQL versions")
	latestCodeQLVersions, err := m.GetLatestCodeQLVersions()
	if err != nil {
		globalLogger.Fatalf("failed to get latest CodeQL versions: %v", err)
	}
	m.LatestCodeQLVersions = []string{latestCodeQLVersions.CLIVersion, latestCodeQLVersions.PriorCliVersion}
	globalLogger.Debugf("Retrieved latest CodeQL versions")

	globalLogger.Infof("Retrieving eMASS system list")
	emassSystemIDs, err := m.GetEMASSSystemList(m.Config.EMASSSystemListOrg, m.Config.EMASSSystemListRepo, m.Config.EMASSSystemListPath)
	if err != nil {
		globalLogger.Fatalf("failed to get eMASS system list: %v", err)
	}
	m.EMASSSystemIDs = emassSystemIDs
	globalLogger.Debugf("Retrieved %d eMASS system IDs", len(emassSystemIDs))

	globalLogger.Infof("Retrieving monorepo list")
	monorepoList, err := m.GetMonorepoList(m.Config.MonorepoListOrg, m.Config.MonorepoListRepo, m.Config.MonorepoListPath)
	if err != nil {
		globalLogger.Fatalf("failed to get monorepo list: %v", err)
	}
	m.MonorepoList = monorepoList
	globalLogger.Debugf("Retrieved %d monorepos", len(monorepoList.Repos))

	globalLogger.Infof("Retrieving repositories")
	repos, err := m.ListRepos()
	if err != nil {
		globalLogger.Fatalf("failed to list repositories: %v", err)
	}
	globalLogger.Debugf("Retrieved %d repositories", len(repos))

	states := map[string]*internal.State{}
	for _, repo := range repos {
		state, err := m.ProcessRepository(repo)
		if err != nil {
			globalLogger.Errorf("Failed processing repository [%s], skipping: %v", repo.GetFullName(), err)
		}
		if state != nil {
			states[repo.GetFullName()] = state
		}
	}

	metrics := generateMetrics(states)
	globalLogger.Infof("Retrieving state file: %s/%s/%s/%s", m.Config.StateFileOrg, m.Config.StateFileRepo, m.Config.StateFileBranch, m.Config.StateFilePath)
	content, sha, err := m.GetStateFile(m.Config.StateFileOrg, m.Config.StateFileRepo, m.Config.StateFileBranch, m.Config.StateFilePath)
	if err != nil {
		globalLogger.Fatalf("Failed retrieving state file: %v", err)
	}

	report := &internal.Report{
		Metrics: append(content.Metrics, metrics),
		States:  states,
	}
	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		globalLogger.Fatalf("Failed marshalling JSON")
	}
	message := "Update state file"
	err = m.UpdateFile(m.Config.StateFileOrg, m.Config.StateFileRepo, m.Config.StateFileBranch, m.Config.StateFilePath, sha, message, reportJSON)
	if err != nil {
		globalLogger.Fatalf("Failed updating state file: %v", err)
	}
}

func generateMetrics(states map[string]*internal.State) *internal.Metric {
	metrics := &internal.Metric{
		Timestamp:    time.Now().In(time.UTC),
		Enabled:      0,
		NonCompliant: 0,
		NotEnabled:   0,
	}
	for _, state := range states {
		if !state.EMASSConfigMissing &&
			!state.Archived &&
			!state.Ignored &&
			!state.SystemOwnerEmailMissing &&
			!state.SystemIDMissing &&
			!state.CLIVersionInvalid &&
			len(state.MissingAnalyses) == 0 &&
			len(state.MissingDatabases) == 0 {
			metrics.Enabled++
			continue
		}

		if (!state.EMASSConfigMissing &&
			!state.Archived &&
			!state.Ignored &&
			!state.SystemOwnerEmailMissing &&
			!state.SystemIDMissing &&
			!state.CLIVersionInvalid) &&
			(len(state.MissingAnalyses) > 0 ||
				len(state.MissingDatabases) > 0) {
			metrics.NonCompliant++
			continue
		}

		metrics.NotEnabled++
	}

	return metrics
}
