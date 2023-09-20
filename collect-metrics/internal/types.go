package internal

import (
	"encoding/json"
	"time"
)

type Input struct {
	AdminToken                string
	DaysToScan                int
	EMASSSystemListOrg        string
	EMASSSystemListRepo       string
	EMASSSystemListPath       string
	MetricsAppID              int64
	MetricsAppPrivateKey      []byte
	MetricsAppInstallationID  int64
	MonorepoListOrg           string
	MonorepoListRepo          string
	MonorepoListPath          string
	StateFileOrg              string
	StateFileRepo             string
	StateFileBranch           string
	StateFilePath             string
	VerifyScansAppID          int64
	VerifyScansPrivateKey     []byte
	VerifyScansInstallationID int64
}

type CodeQLDefaultVersions struct {
	CLIVersion      string `json:"cliVersion"`
	PriorCliVersion string `json:"priorCliVersion"`
}

type EMASSConfig struct {
	SystemID         json.Number `json:"systemID"`
	SystemName       string      `json:"systemName"`
	SystemOwnerEmail string      `json:"systemOwnerEmail"`
	SystemOwnerName  string      `json:"systemOwnerName"`
}

type CodeQLConfig struct {
	ExcludedLanguages []ExcludedLanguage `yaml:"excluded_languages"`
	BuildCommands     map[string]string  `yaml:"build_commands"`
}

type ExcludedLanguage struct {
	Name   string `yaml:"name"`
	Reason string `yaml:"reason"`
}

type codeQLDatabase struct {
	Language  string    `json:"language"`
	CreatedAt time.Time `json:"created_at"`
}

type Analyses struct {
	Languages []string `json:"languages"`
	Versions  []string `json:"versions"`
}

type analysisResult struct {
	CreatedAt time.Time `json:"created_at"`
	Language  string    `json:"language"`
	Category  string    `json:"category"`
	Tool      struct {
		Version string `json:"version"`
	} `json:"tool"`
}

type analysisRequest struct {
	Ref       string `json:"ref"`
	ToolName  string `json:"tool_name"`
	Direction string `json:"direction"`
	Sort      string `json:"sort"`
}

type State struct {
	Archived                bool     `json:"archived"`
	Ignored                 bool     `json:"ignored"`
	EMASSConfigMissing      bool     `json:"emass_config_missing"`
	SystemOwnerEmailMissing bool     `json:"system_owner_email_missing"`
	SystemIDMissing         bool     `json:"system_id_missing"`
	CLIVersionInvalid       bool     `json:"cli_version_invalid"`
	MissingAnalyses         []string `json:"missing_analyses"`
	MissingDatabases        []string `json:"missing_databases"`
	Monorepo                bool     `json:"monorepo"`

	CodeScanningAlertCount   int `json:"code_scanning_alert_count"`
	DependabotAlertCount     int `json:"dependabot_alert_count"`
	SecretScanningAlertCount int `json:"secret_scanning_alert_count"`
}

type Metric struct {
	Timestamp    time.Time `json:"timestamp"`
	Enabled      int       `json:"enabled"`
	NonCompliant int       `json:"non_compliant"`
	NotEnabled   int       `json:"not_enabled"`
}

type Report struct {
	Metrics []*Metric         `json:"metrics"`
	States  map[string]*State `json:"states"`
}

type RepoList struct {
	Repos []string `yaml:"repos"`
}
