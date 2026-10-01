# Changelog

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.api.projectsGetJobs` (was `client.api.projectsJobs2`), `client.api.projectsGetReleases` (was `client.api.projectsReleases2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.

