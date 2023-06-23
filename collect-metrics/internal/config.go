package internal

import (
	"strconv"

	"github.com/sethvargo/go-githubactions"
)

func ParseInput() *Input {
	adminToken := githubactions.GetInput("admin_token")
	if adminToken == "" {
		githubactions.Fatalf("admin_token input is required")
	}

	daysToScanString := githubactions.GetInput("days_to_scan")
	if daysToScanString == "" {
		githubactions.Fatalf("days_to_scan input is required")
	}
	daysToScan, err := strconv.Atoi(daysToScanString)
	if err != nil {
		githubactions.Fatalf("days_to_scan input must be an integer")
	}

	eMASSSystemListOrg := githubactions.GetInput("emass_system_list_org")
	if eMASSSystemListOrg == "" {
		githubactions.Fatalf("emass_system_list_org input must be an integer")
	}

	eMASSSystemListRepo := githubactions.GetInput("emass_system_list_repo")
	if eMASSSystemListRepo == "" {
		githubactions.Fatalf("emass_system_list_repo input must be an integer")
	}

	eMASSSystemListPath := githubactions.GetInput("emass_system_list_path")
	if eMASSSystemListPath == "" {
		githubactions.Fatalf("emass_system_list_path input must be an integer")
	}

	metricsAppID := githubactions.GetInput("metrics_app_id")
	if metricsAppID == "" {
		githubactions.Fatalf("metrics_app_id input is required")
	}
	metricsAppIDInt64, err := strconv.ParseInt(metricsAppID, 10, 64)
	if err != nil {
		githubactions.Fatalf("metrics_app_id input must be an integer")
	}

	metricsAppPrivateKey := githubactions.GetInput("metrics_app_private_key")
	if metricsAppPrivateKey == "" {
		githubactions.Fatalf("metrics_app_private_key input is required")
	}

	metricsAppInstallationID := githubactions.GetInput("metrics_app_installation_id")
	if metricsAppInstallationID == "" {
		githubactions.Fatalf("metrics_app_installation_id input is required")
	}
	metricsAppInstallationIDInt64, err := strconv.ParseInt(metricsAppInstallationID, 10, 64)
	if err != nil {
		githubactions.Fatalf("metrics_app_installation_id input must be an integer")
	}

	monorepoListOrg := githubactions.GetInput("monorepo_list_org")
	if eMASSSystemListOrg == "" {
		githubactions.Fatalf("emass_system_list_org input must be an integer")
	}

	monorepoListRepo := githubactions.GetInput("monorepo_list_repo")
	if eMASSSystemListRepo == "" {
		githubactions.Fatalf("emass_system_list_repo input must be an integer")
	}

	monorepoListPath := githubactions.GetInput("monorepo_list_path")
	if eMASSSystemListPath == "" {
		githubactions.Fatalf("emass_system_list_path input must be an integer")
	}

	stateFileOrg := githubactions.GetInput("state_file_org")
	if stateFileOrg == "" {
		githubactions.Fatalf("state_file_org input is required")
	}

	stateFileRepo := githubactions.GetInput("state_file_repo")
	if stateFileRepo == "" {
		githubactions.Fatalf("state_file_repo input is required")
	}

	stateFileBranch := githubactions.GetInput("state_file_branch")
	if stateFileRepo == "" {
		githubactions.Fatalf("state_file_branch input is required")
	}

	stateFilePath := githubactions.GetInput("state_file_path")
	if stateFilePath == "" {
		githubactions.Fatalf("state_file_path input is required")
	}

	verifyScansAppID := githubactions.GetInput("verify_scans_app_id")
	if verifyScansAppID == "" {
		githubactions.Fatalf("verify_scans_app_id input is required")
	}
	verifyScansAppIDInt64, err := strconv.ParseInt(verifyScansAppID, 10, 64)
	if err != nil {
		githubactions.Fatalf("verify_scans_app_id input must be an integer")
	}

	verifyScansAppPrivateKey := githubactions.GetInput("verify_scans_app_private_key")
	if verifyScansAppPrivateKey == "" {
		githubactions.Fatalf("verify_scans_app_private_key input is required")
	}

	verifyScansAppInstallationID := githubactions.GetInput("verify_scans_app_installation_id")
	if verifyScansAppInstallationID == "" {
		githubactions.Fatalf("verify_scans_app_installation_id input is required")
	}
	verifyScansAppInstallationIDInt64, err := strconv.ParseInt(verifyScansAppInstallationID, 10, 64)
	if err != nil {
		githubactions.Fatalf("verify_scans_app_installation_id input must be an integer")
	}

	return &Input{
		AdminToken:                adminToken,
		DaysToScan:                daysToScan,
		EMASSSystemListOrg:        eMASSSystemListOrg,
		EMASSSystemListRepo:       eMASSSystemListRepo,
		EMASSSystemListPath:       eMASSSystemListPath,
		StateFileOrg:              stateFileOrg,
		StateFileRepo:             stateFileRepo,
		StateFileBranch:           stateFileBranch,
		StateFilePath:             stateFilePath,
		MetricsAppID:              metricsAppIDInt64,
		MetricsAppPrivateKey:      []byte(metricsAppPrivateKey),
		MetricsAppInstallationID:  metricsAppInstallationIDInt64,
		MonorepoListOrg:           monorepoListOrg,
		MonorepoListRepo:          monorepoListRepo,
		MonorepoListPath:          monorepoListPath,
		VerifyScansAppID:          verifyScansAppIDInt64,
		VerifyScansPrivateKey:     []byte(verifyScansAppPrivateKey),
		VerifyScansInstallationID: verifyScansAppInstallationIDInt64,
	}
}
