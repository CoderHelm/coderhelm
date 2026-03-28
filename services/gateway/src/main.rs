use axum::{
    middleware as axum_middleware,
    routing::{get, post, put},
    Router,
};
use lambda_http::{run, Error};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod auth;
mod clients;
mod middleware;
mod models;
mod routes;

pub struct AppState {
    pub dynamo: aws_sdk_dynamodb::Client,
    pub sqs: aws_sdk_sqs::Client,
    pub secrets: models::Secrets,
    pub config: models::Config,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Structured JSON logging for CloudWatch
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer().json().flatten_event(true))
        .init();

    // Initialize AWS SDK
    let aws_config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let dynamo = aws_sdk_dynamodb::Client::new(&aws_config);
    let sqs = aws_sdk_sqs::Client::new(&aws_config);
    let sm = aws_sdk_secretsmanager::Client::new(&aws_config);

    // Load secrets from Secrets Manager
    let secrets_name =
        std::env::var("SECRETS_NAME").unwrap_or_else(|_| "d3ftly/prod/secrets".to_string());
    let secrets = models::Secrets::load(&sm, &secrets_name).await?;

    let config = models::Config::from_env();

    let state = Arc::new(AppState {
        dynamo,
        sqs,
        secrets,
        config,
    });

    // Build router
    // Protected API routes — require valid JWT with tenant scoping
    let api_routes = Router::new()
        .route("/me", get(routes::api::me))
        .route("/runs", get(routes::api::list_runs))
        .route("/runs/:run_id", get(routes::api::get_run))
        .route("/repos", get(routes::api::list_repos))
        .route("/repos/:repo", post(routes::api::update_repo))
        .route("/stats", get(routes::api::get_stats))
        .route(
            "/instructions/global",
            get(routes::api::get_global_instructions)
                .put(routes::api::update_global_instructions),
        )
        .route(
            "/instructions/repo/:repo",
            get(routes::api::get_repo_instructions)
                .put(routes::api::update_repo_instructions),
        )
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::require_auth,
        ));

    let app = Router::new()
        // Webhooks (public, verified by signature)
        .route("/webhooks/github", post(routes::github_webhook::handle))
        .route("/webhooks/jira", post(routes::jira_webhook::handle))
        .route("/webhooks/stripe", post(routes::stripe_webhook::handle))
        // Auth (public)
        .route("/auth/login", get(routes::auth::login))
        .route("/auth/callback", get(routes::auth::callback))
        .route("/auth/logout", post(routes::auth::logout))
        // Nest protected routes under /api
        .nest("/api", api_routes)
        .with_state(state);

    run(app).await
}
