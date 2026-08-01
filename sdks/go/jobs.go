package locavello

import (
	"context"
	"net/url"
)

// JobsResource is the agent-translation + Mode B crawl surface (Bearer
// auth).
type JobsResource struct {
	c *Client
}

// Translate calls POST /api/v1/projects/{id}/translate — queue a
// machine first pass for a locale. Returns the job with an upfront
// word estimate in Stats; a live job for the same locale is returned
// with AlreadyQueued true instead of queueing another. Insufficient
// agent-word budget fails with code UPGRADE_REQUIRED.
func (r *JobsResource) Translate(ctx context.Context, projectID, locale string) (*TranslationJob, error) {
	var out TranslationJob
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/translate"
	payload := map[string]string{"locale": locale}
	if err := r.c.do(ctx, "POST", path, nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Crawl calls POST /api/v1/projects/{id}/crawl — queue a Mode B crawl
// of the project's siteUrl (proxy-mode projects only).
func (r *JobsResource) Crawl(ctx context.Context, projectID string) (*TranslationJob, error) {
	var out TranslationJob
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/crawl"
	if err := r.c.do(ctx, "POST", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Pages calls GET /api/v1/projects/{id}/pages — the crawler's
// discovered pages (not cursored; Cursor nil, HasMore false).
func (r *JobsResource) Pages(ctx context.Context, projectID string) (*Page[SitePage], error) {
	return list[SitePage](ctx, r.c, "/api/v1/projects/"+url.PathEscape(projectID)+"/pages", nil)
}

// List calls GET /api/v1/projects/{id}/jobs — the newest 50 jobs (not
// cursored; Cursor nil, HasMore false).
func (r *JobsResource) List(ctx context.Context, projectID string) (*Page[TranslationJob], error) {
	return list[TranslationJob](ctx, r.c, "/api/v1/projects/"+url.PathEscape(projectID)+"/jobs", nil)
}

// Get calls GET /api/v1/projects/jobs/{jobId} — poll one job. (The
// jobs router is mounted under /projects, hence the path.)
func (r *JobsResource) Get(ctx context.Context, jobID string) (*TranslationJob, error) {
	var out TranslationJob
	path := "/api/v1/projects/jobs/" + url.PathEscape(jobID)
	if err := r.c.do(ctx, "GET", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
