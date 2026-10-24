import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRoutes, sectionOf, stripComments } from './lib/routes.mjs';

const FIXTURE = `
    let api_routes = Router::new()
        .route("/me", get(routes::api::me))
        // a comment with .route("/nope", get(x)) in it
        .route(
            "/allowlist",
            get(routes::api::list_allowlist)
                .post(routes::api::add_to_allowlist)
                .delete(routes::api::remove_from_allowlist),
        )
        .route("/admin/teams", get(routes::admin::admin_teams))
        .layer(axum_middleware::from_fn_with_state(state.clone(), require_auth));

    let webhook_routes = Router::new()
        .route("/github", post(routes::github_webhook::handle))
        .route("/jira/:token", post(routes::jira_webhook::handle));

    let app = Router::new()
        .route(
            "/",
            get(|| async {
                axum::Json(serde_json::json!({ "service": "coderhelm", "status": "ok" }))
            }),
        )
        .nest("/webhooks", webhook_routes)
        .nest("/api", api_routes);
`;

test('extracts every route with its prefix, methods and handlers', () => {
  const routes = extractRoutes(FIXTURE).map((r) => `${r.method} ${r.path} ${r.handler}`);
  assert.deepEqual(routes, [
    'GET /api/me api::me',
    'GET /api/allowlist api::list_allowlist',
    'POST /api/allowlist api::add_to_allowlist',
    'DELETE /api/allowlist api::remove_from_allowlist',
    'GET /api/admin/teams admin::admin_teams',
    'POST /webhooks/github github_webhook::handle',
    'POST /webhooks/jira/:token jira_webhook::handle',
    'GET / inline',
  ]);
});

test('sections follow the router and the first path segment', () => {
  const r = extractRoutes(FIXTURE);
  assert.equal(sectionOf(r[0]), 'Account and teams');
  assert.equal(sectionOf(r[4]), 'Platform admin');
  assert.equal(sectionOf(r[5]), 'Webhooks');
  assert.equal(sectionOf(r[7]), 'Service');
});

test('comments are removed but strings keep their slashes', () => {
  assert.equal(stripComments('a("https://x") // c').trim(), 'a("https://x")');
});
