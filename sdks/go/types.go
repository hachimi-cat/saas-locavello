package locavello

import "encoding/json"

// Translation statuses. "missing" is a Keys.List filter value only —
// it means no translation row exists for the locale.
const (
	StatusMissing     = "missing"
	StatusMachine     = "machine"
	StatusNeedsReview = "needs_review"
	StatusApproved    = "approved"
	StatusRejected    = "rejected"
)

// Project modes.
const (
	ModeSDK   = "sdk"
	ModeProxy = "proxy"
)

// Namespace review policies. Gated namespaces (legal, pricing) never
// ship machine output — approved translations only.
const (
	ReviewPolicyStandard = "standard"
	ReviewPolicyGated    = "gated"
)

// Translation-job kinds.
const (
	JobKindMachinePass = "machine_pass"
	JobKindCrawl       = "crawl"
	JobKindPreview     = "preview"
)

// Translation-job statuses.
const (
	JobStatusQueued  = "queued"
	JobStatusRunning = "running"
	JobStatusDone    = "done"
	JobStatusFailed  = "failed"
)

// Billing tiers.
const (
	TierFree    = "free"
	TierStarter = "starter"
	TierPro     = "pro"
	TierScale   = "scale"
)

// Project is a localization project (Mode A "sdk" or Mode B "proxy").
type Project struct {
	ID           string  `json:"id"`
	AccountID    string  `json:"accountId"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	SourceLocale string  `json:"sourceLocale"`
	Mode         string  `json:"mode"` // "sdk" | "proxy"
	SiteURL      *string `json:"siteUrl"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

// ProjectLocale is one enabled target locale on a project.
type ProjectLocale struct {
	ID        string  `json:"id"`
	ProjectID string  `json:"projectId"`
	Tag       string  `json:"tag"`
	Fallback  *string `json:"fallback"`
	RTL       bool    `json:"rtl"`
	Enabled   bool    `json:"enabled"`
}

// ProjectLocaleStat is a locale plus its per-status completion counts —
// what Projects.Get / Projects.Locales return.
type ProjectLocaleStat struct {
	ProjectLocale
	KeyCount    int `json:"keyCount"`
	Approved    int `json:"approved"`
	Machine     int `json:"machine"`
	NeedsReview int `json:"needsReview"`
	Missing     int `json:"missing"`
}

// Namespace groups keys under a review policy ("standard" | "gated").
type Namespace struct {
	ID           string `json:"id"`
	ProjectID    string `json:"projectId"`
	Name         string `json:"name"`
	ReviewPolicy string `json:"reviewPolicy"`
}

// KeyNamespace is the namespace summary embedded on Key rows.
type KeyNamespace struct {
	Name         string `json:"name"`
	ReviewPolicy string `json:"reviewPolicy"`
}

// KeyInput is one key in a Keys.Upsert payload.
type KeyInput struct {
	// Namespace defaults to "default" server-side when empty.
	Namespace   string  `json:"namespace,omitempty"`
	Name        string  `json:"name"`
	SourceText  string  `json:"sourceText"`
	Description *string `json:"description,omitempty"`
	MaxLength   *int    `json:"maxLength,omitempty"`
	// Context is free-shape extract metadata (usage sites, hints).
	Context map[string]any `json:"context,omitempty"`
}

// Key is a translatable string with its source text + metadata.
// Placeholders are derived server-side from the source text; the
// placeholder-safety gate rejects translations that drop or rename one.
type Key struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"projectId"`
	NamespaceID   string  `json:"namespaceId"`
	Name          string  `json:"name"`
	SourceText    string  `json:"sourceText"`
	Description   *string `json:"description"`
	ScreenshotURL *string `json:"screenshotUrl,omitempty"`
	MaxLength     *int    `json:"maxLength"`
	// Context is the open-shape usage metadata from extract.
	Context      json.RawMessage `json:"context"`
	Placeholders []string        `json:"placeholders"`
	Archived     bool            `json:"archived"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
	// Namespace + Translations are populated on list/queue reads.
	Namespace    *KeyNamespace `json:"namespace,omitempty"`
	Translations []Translation `json:"translations,omitempty"`
}

// Translation is one (key, locale) value with review state.
type Translation struct {
	ID             string  `json:"id"`
	KeyID          string  `json:"keyId"`
	Locale         string  `json:"locale"`
	Value          string  `json:"value"`
	Status         string  `json:"status"` // "machine" | "needs_review" | "approved" | "rejected"
	Author         *string `json:"author"`
	ReviewedBy     *string `json:"reviewedBy"`
	RejectedReason *string `json:"rejectedReason"`
	WordCount      int     `json:"wordCount"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// Release is a frozen, content-hashed catalog for (project, locale).
type Release struct {
	ID          string `json:"id"`
	ProjectID   string `json:"projectId"`
	Locale      string `json:"locale"`
	ContentHash string `json:"contentHash"`
	// Catalog maps catalog key name → message (open shape on the wire).
	Catalog   map[string]any `json:"catalog"`
	KeyCount  int            `json:"keyCount"`
	CreatedBy *string        `json:"createdBy"`
	CreatedAt string         `json:"createdAt"`
	// Unchanged is true when Publish found an identical existing
	// release and returned it instead of creating a new row.
	Unchanged bool `json:"unchanged,omitempty"`
}

// ReleaseSummary is a release row without its catalog (list reads +
// the lastRelease slot on Projects.Get).
type ReleaseSummary struct {
	ID          string  `json:"id"`
	Locale      string  `json:"locale"`
	ContentHash string  `json:"contentHash,omitempty"`
	KeyCount    int     `json:"keyCount"`
	CreatedBy   *string `json:"createdBy,omitempty"`
	CreatedAt   string  `json:"createdAt"`
}

// TranslationJob is an agent-translation run (machine pass, crawl, or
// public preview).
type TranslationJob struct {
	ID        string  `json:"id"`
	AccountID string  `json:"accountId"`
	ProjectID *string `json:"projectId"`
	Locale    *string `json:"locale"`
	Kind      string  `json:"kind"`   // "machine_pass" | "crawl" | "preview"
	Status    string  `json:"status"` // "queued" | "running" | "done" | "failed"
	// Stats is open-shape run telemetry (estimatedKeys, estimatedWords, …).
	Stats       map[string]any `json:"stats"`
	Error       *string        `json:"error"`
	RequestedBy *string        `json:"requestedBy"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
	// AlreadyQueued is true when Translate/Crawl found a live job for
	// the same target and returned it instead of queueing another.
	AlreadyQueued bool `json:"alreadyQueued,omitempty"`
}

// SitePage is one discovered page of a Mode B (proxy) project.
type SitePage struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"projectId"`
	Path          string  `json:"path"`
	Status        string  `json:"status"` // "discovered" | "crawled" | "error"
	KeyCount      int     `json:"keyCount"`
	LastCrawledAt *string `json:"lastCrawledAt"`
	LastError     *string `json:"lastError"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

// GlossaryTerm is a forced translation (locale + translation set) or a
// do-not-translate term (both nil). ProjectID nil = account-wide.
type GlossaryTerm struct {
	ID          string  `json:"id"`
	AccountID   string  `json:"accountId"`
	ProjectID   *string `json:"projectId"`
	Term        string  `json:"term"`
	Locale      *string `json:"locale"`
	Translation *string `json:"translation"`
	Note        *string `json:"note"`
	CreatedAt   string  `json:"createdAt"`
}

// TmEntry is one translation-memory row — the cross-project reuse
// asset. Quality "approved" beats "machine".
type TmEntry struct {
	ID           string  `json:"id"`
	AccountID    string  `json:"accountId"`
	ProjectID    *string `json:"projectId"`
	SourceLocale string  `json:"sourceLocale"`
	TargetLocale string  `json:"targetLocale"`
	SourceText   string  `json:"sourceText"`
	SourceHash   string  `json:"sourceHash"`
	TargetText   string  `json:"targetText"`
	Quality      string  `json:"quality"` // "approved" | "machine"
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

// CheckIssue is one error/warning row from Releases.Check. Type is one
// of "missing_key", "placeholder_mismatch", "length_overflow",
// "glossary_violation", "unreviewed"; the optional fields are populated
// per type.
type CheckIssue struct {
	Type      string   `json:"type"`
	Locale    string   `json:"locale"`
	Key       string   `json:"key"`
	Missing   []string `json:"missing,omitempty"`
	Extra     []string `json:"extra,omitempty"`
	MaxLength *int     `json:"maxLength,omitempty"`
	Estimated *int     `json:"estimated,omitempty"`
	Term      *string  `json:"term,omitempty"`
	Status    *string  `json:"status,omitempty"`
}
