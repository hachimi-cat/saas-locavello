package locavello

import (
	"context"
	"net/http"
	"net/url"
)

// Page is one page of a cursor-paginated list. List endpoints put the
// items in the envelope's data slot and cursor/hasMore in meta; the SDK
// lifts them here. Cursor is nil on the last page.
//
// Non-cursor list endpoints (glossary, TM search, jobs, pages, API
// keys) return the same shape with Cursor nil + HasMore false.
type Page[T any] struct {
	Data    []T
	Cursor  *string
	HasMore bool
}

// Paginate walks cursor/hasMore until exhaustion and collects every
// item. fetch is called with the cursor for the next page (nil for the
// first).
//
// Example:
//
//	all, err := locavello.Paginate(ctx, func(ctx context.Context, cursor *string) (*locavello.Page[locavello.Project], error) {
//		return c.Projects.List(ctx, &locavello.ProjectListParams{Cursor: cursor})
//	})
//
// Callers that want streaming instead of a fully collected slice can
// loop pages manually with the same cursor/hasMore dance.
func Paginate[T any](
	ctx context.Context,
	fetch func(ctx context.Context, cursor *string) (*Page[T], error),
) ([]T, error) {
	var all []T
	var cursor *string
	for {
		page, err := fetch(ctx, cursor)
		if err != nil {
			return nil, err
		}
		all = append(all, page.Data...)
		if !page.HasMore || page.Cursor == nil {
			return all, nil
		}
		cursor = page.Cursor
	}
}

// list is the shared authed GET-list helper: performs the request and
// lifts meta.cursor/meta.hasMore into a Page.
func list[T any](ctx context.Context, c *Client, path string, query url.Values) (*Page[T], error) {
	var items []T
	meta, err := c.doEnvelope(ctx, http.MethodGet, path, query, nil, false, &items)
	if err != nil {
		return nil, err
	}
	page := &Page[T]{Data: items}
	if page.Data == nil {
		page.Data = []T{}
	}
	if meta != nil {
		page.Cursor = meta.Cursor
		page.HasMore = meta.HasMore
	}
	return page, nil
}
