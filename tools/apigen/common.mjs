// What counts as a product feature (the routes SDKs, CLI, docs and Catent cover):
// everything but sign-in, the platform operator's admin routes, plumbing between the
// services and the product's own BFF, and webhooks another system sends in.
const NOT_A_FEATURE = /\/(admin|admin-portal|auth|oauth|oidc|login|logout|signup|register|password|device|jwks|\.well-known|internal|catentio|huudis|img-proxy|proxy|hello|health|healthz|readyz|status|version|console|session)(\/|$)/;
const WEBHOOK_IN = /\/webhooks?(\/(?!endpoints)[^/]+)?$|\/webhook\//;

// Only the five verbs are calls a client makes; an OPTIONS/HEAD handler (a CORS
// preflight) is not a feature and has no verb to name its command or method by.
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function isFeature(method, path) {
  if (!VERBS.has(method.toLowerCase())) return false;
  if (path.includes('*') || NOT_A_FEATURE.test(path)) return false;
  if (method.toLowerCase() === 'post' && WEBHOOK_IN.test(path)) return false;
  return true;
}
