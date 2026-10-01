# Changelog

## 0.3.0
- A route read by id next to its list is named `get` + the list's name: `client.API.ProjectsGetJobs` (was `client.API.ProjectsJobs2`), `client.API.ProjectsGetReleases` (was `client.API.ProjectsReleases2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.

