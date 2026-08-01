package locavello

import "context"

// BillingResource is the workspace plan + Plugipay checkout surface
// (Bearer auth).
type BillingResource struct {
	c *Client
}

// TierDef is one row of the tier table (ids: free / starter / pro /
// scale).
type TierDef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// PriceIDR is whole rupiah per month. 0 = free.
	PriceIDR           int      `json:"priceIdr"`
	ProjectLimit       int      `json:"projectLimit"`
	LocalesPerProject  int      `json:"localesPerProject"`
	KeysPerProject     int      `json:"keysPerProject"`
	AgentWordsPerMonth int      `json:"agentWordsPerMonth"`
	Blurb              string   `json:"blurb"`
	Features           []string `json:"features"`
}

// BillingSubscription is the workspace's current subscription. A
// workspace with no purchase history reports tier "free" with a nil ID.
type BillingSubscription struct {
	ID                        *string `json:"id"`
	AccountID                 string  `json:"accountId"`
	Tier                      string  `json:"tier"`   // free | starter | pro | scale
	Status                    string  `json:"status"` // active | past_due | canceled
	PlugipayCheckoutSessionID *string `json:"plugipayCheckoutSessionId"`
	CurrentPeriodEnd          *string `json:"currentPeriodEnd"`
}

// AgentWordsUsage is the metered agent-word budget — the one limit
// enforced even during early access.
type AgentWordsUsage struct {
	Used  int `json:"used"`
	Limit int `json:"limit"`
}

// BillingUsage is the live usage block on BillingInfo.
type BillingUsage struct {
	Projects   int             `json:"projects"`
	AgentWords AgentWordsUsage `json:"agentWords"`
}

// BillingInfo is the GET /api/v1/billing response.
type BillingInfo struct {
	Subscription BillingSubscription `json:"subscription"`
	// EarlyAccess: paid tiers are recorded truthfully but feature
	// limits are not enforced yet (the agent-word budget is).
	EarlyAccess bool         `json:"earlyAccess"`
	Usage       BillingUsage `json:"usage"`
	Tiers       []TierDef    `json:"tiers"`
}

// Get calls GET /api/v1/billing — current subscription, usage, and the
// tier table.
func (r *BillingResource) Get(ctx context.Context) (*BillingInfo, error) {
	var out BillingInfo
	if err := r.c.do(ctx, "GET", "/api/v1/billing", nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CheckoutResult carries the Plugipay hosted checkout to redirect the
// browser to.
type CheckoutResult struct {
	CheckoutSessionID string `json:"checkoutSessionId"`
	HostedURL         string `json:"hostedUrl"`
}

// Checkout calls POST /api/v1/billing/checkout for a paid tier
// (TierStarter | TierPro | TierScale); redirect the browser to
// HostedURL.
func (r *BillingResource) Checkout(ctx context.Context, tier string) (*CheckoutResult, error) {
	var out CheckoutResult
	payload := map[string]string{"tier": tier}
	if err := r.c.do(ctx, "POST", "/api/v1/billing/checkout", nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
