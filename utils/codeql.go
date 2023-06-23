package utils

var SupportedCodeQLLanguages = []string{
	"c",
	"cpp",
	"csharp",
	"go",
	"java",
	"kotlin",
	"javascript",
	"python",
	"ruby",
	"typescript",
	"swift",
}

func IsSupportedCodeQLLanguage(language string) bool {
	for _, supportedLanguage := range SupportedCodeQLLanguages {
		if language == supportedLanguage {
			return true
		}
	}
	return false
}
