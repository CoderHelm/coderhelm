use axum::{extract::State, http::StatusCode, Extension, Json};
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::error;

use crate::models::Claims;
use crate::AppState;

/// GET /api/me — return current user info.
pub async fn me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, StatusCode> {
    // Fetch user record from DynamoDB
    let result = state
        .dynamo
        .get_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(&claims.tenant_id))
        .key("sk", attr_s(&claims.sub))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let item = result.item().ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(json!({
        "user_id": claims.sub,
        "tenant_id": claims.tenant_id,
        "github_login": claims.github_login,
        "email": item.get("email").and_then(|v| v.as_s().ok()),
        "avatar_url": item.get("avatar_url").and_then(|v| v.as_s().ok()),
        "role": item.get("role").and_then(|v| v.as_s().ok()),
    })))
}

/// GET /api/runs — list runs for the tenant.
pub async fn list_runs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, StatusCode> {
    let result = state
        .dynamo
        .query()
        .table_name(&state.config.table_name)
        .key_condition_expression("pk = :pk AND begins_with(sk, :prefix)")
        .expression_attribute_values(":pk", attr_s(&claims.tenant_id))
        .expression_attribute_values(":prefix", attr_s("RUN#"))
        .scan_index_forward(false) // newest first
        .limit(50)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to query runs: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let runs: Vec<Value> = result
        .items()
        .iter()
        .map(|item| {
            json!({
                "run_id": item.get("run_id").and_then(|v| v.as_s().ok()),
                "status": item.get("status").and_then(|v| v.as_s().ok()),
                "ticket_id": item.get("ticket_id").and_then(|v| v.as_s().ok()),
                "title": item.get("title").and_then(|v| v.as_s().ok()),
                "repo": item.get("repo").and_then(|v| v.as_s().ok()),
                "pr_url": item.get("pr_url").and_then(|v| v.as_s().ok()),
                "cost_usd": item.get("cost_usd").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<f64>().ok()),
                "duration_s": item.get("duration_s").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()),
                "created_at": item.get("created_at").and_then(|v| v.as_s().ok()),
            })
        })
        .collect();

    Ok(Json(json!({ "runs": runs })))
}

/// GET /api/runs/:run_id — get single run detail.
pub async fn get_run(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    axum::extract::Path(run_id): axum::extract::Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let result = state
        .dynamo
        .get_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(&claims.tenant_id))
        .key("sk", attr_s(&format!("RUN#{run_id}")))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch run: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let item = result.item().ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(json!({
        "run_id": item.get("run_id").and_then(|v| v.as_s().ok()),
        "status": item.get("status").and_then(|v| v.as_s().ok()),
        "ticket_source": item.get("ticket_source").and_then(|v| v.as_s().ok()),
        "ticket_id": item.get("ticket_id").and_then(|v| v.as_s().ok()),
        "title": item.get("title").and_then(|v| v.as_s().ok()),
        "repo": item.get("repo").and_then(|v| v.as_s().ok()),
        "branch": item.get("branch").and_then(|v| v.as_s().ok()),
        "pr_url": item.get("pr_url").and_then(|v| v.as_s().ok()),
        "pr_number": item.get("pr_number").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()),
        "current_pass": item.get("current_pass").and_then(|v| v.as_s().ok()),
        "tokens_in": item.get("tokens_in").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()),
        "tokens_out": item.get("tokens_out").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()),
        "cost_usd": item.get("cost_usd").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<f64>().ok()),
        "files_modified": item.get("files_modified").and_then(|v| v.as_l().ok()),
        "duration_s": item.get("duration_s").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()),
        "error": item.get("error").and_then(|v| v.as_s().ok()),
        "created_at": item.get("created_at").and_then(|v| v.as_s().ok()),
        "updated_at": item.get("updated_at").and_then(|v| v.as_s().ok()),
    })))
}

/// GET /api/repos — list repos configured for this tenant.
pub async fn list_repos(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, StatusCode> {
    let result = state
        .dynamo
        .query()
        .table_name(&state.config.table_name)
        .key_condition_expression("pk = :pk AND begins_with(sk, :prefix)")
        .expression_attribute_values(":pk", attr_s(&claims.tenant_id))
        .expression_attribute_values(":prefix", attr_s("REPO#"))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to query repos: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let repos: Vec<Value> = result
        .items()
        .iter()
        .map(|item| {
            json!({
                "name": item.get("repo_name").and_then(|v| v.as_s().ok()),
                "enabled": item.get("enabled").and_then(|v| v.as_bool().ok()),
                "ticket_source": item.get("ticket_source").and_then(|v| v.as_s().ok()),
            })
        })
        .collect();

    Ok(Json(json!({ "repos": repos })))
}

/// POST /api/repos/:repo — update repo config.
pub async fn update_repo(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    axum::extract::Path(repo): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> Result<StatusCode, StatusCode> {
    let enabled = body["enabled"].as_bool().unwrap_or(true);

    state
        .dynamo
        .put_item()
        .table_name(&state.config.table_name)
        .item("pk", attr_s(&claims.tenant_id))
        .item("sk", attr_s(&format!("REPO#{repo}")))
        .item("repo_name", attr_s(&repo))
        .item(
            "enabled",
            aws_sdk_dynamodb::types::AttributeValue::Bool(enabled),
        )
        .item("ticket_source", attr_s("github"))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to update repo: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

/// GET /api/stats — aggregated stats for the tenant.
pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, StatusCode> {
    // Query all runs for this month
    let result = state
        .dynamo
        .query()
        .table_name(&state.config.table_name)
        .key_condition_expression("pk = :pk AND begins_with(sk, :prefix)")
        .expression_attribute_values(":pk", attr_s(&claims.tenant_id))
        .expression_attribute_values(":prefix", attr_s("RUN#"))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to query stats: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let items = result.items();
    let total_runs = items.len();
    let mut completed = 0u64;
    let mut failed = 0u64;
    let mut total_cost = 0.0f64;
    let mut total_tokens_in = 0u64;
    let mut total_tokens_out = 0u64;

    for item in items {
        let status = item.get("status").and_then(|v| v.as_s().ok()).unwrap_or(&"".to_string()).clone();
        match status.as_str() {
            "completed" => completed += 1,
            "failed" => failed += 1,
            _ => {}
        }
        if let Some(cost) = item
            .get("cost_usd")
            .and_then(|v| v.as_n().ok())
            .and_then(|n| n.parse::<f64>().ok())
        {
            total_cost += cost;
        }
        if let Some(t) = item
            .get("tokens_in")
            .and_then(|v| v.as_n().ok())
            .and_then(|n| n.parse::<u64>().ok())
        {
            total_tokens_in += t;
        }
        if let Some(t) = item
            .get("tokens_out")
            .and_then(|v| v.as_n().ok())
            .and_then(|n| n.parse::<u64>().ok())
        {
            total_tokens_out += t;
        }
    }

    Ok(Json(json!({
        "total_runs": total_runs,
        "completed": completed,
        "failed": failed,
        "in_progress": total_runs as u64 - completed - failed,
        "total_cost_usd": total_cost,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "merge_rate": if completed > 0 { completed as f64 / total_runs as f64 } else { 0.0 },
    })))
}

fn attr_s(val: &str) -> aws_sdk_dynamodb::types::AttributeValue {
    aws_sdk_dynamodb::types::AttributeValue::S(val.to_string())
}

const MAX_INSTRUCTIONS_BYTES: usize = 10_240; // 10KB limit

/// GET /api/instructions/global — get global custom instructions.
pub async fn get_global_instructions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, StatusCode> {
    get_instructions_inner(&state, &claims.tenant_id, "INSTRUCTIONS#GLOBAL").await
}

/// PUT /api/instructions/global — update global custom instructions.
pub async fn update_global_instructions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<Value>,
) -> Result<StatusCode, StatusCode> {
    let content = body["content"].as_str().unwrap_or("");
    update_instructions_inner(&state, &claims.tenant_id, "INSTRUCTIONS#GLOBAL", content).await
}

/// GET /api/instructions/repo/:repo — get per-repo custom instructions.
pub async fn get_repo_instructions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    axum::extract::Path(repo): axum::extract::Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let sk = format!("INSTRUCTIONS#REPO#{repo}");
    get_instructions_inner(&state, &claims.tenant_id, &sk).await
}

/// PUT /api/instructions/repo/:repo — update per-repo custom instructions.
pub async fn update_repo_instructions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    axum::extract::Path(repo): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> Result<StatusCode, StatusCode> {
    let content = body["content"].as_str().unwrap_or("");
    let sk = format!("INSTRUCTIONS#REPO#{repo}");
    update_instructions_inner(&state, &claims.tenant_id, &sk, content).await
}

async fn get_instructions_inner(
    state: &AppState,
    tenant_id: &str,
    sk: &str,
) -> Result<Json<Value>, StatusCode> {
    let result = state
        .dynamo
        .get_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(tenant_id))
        .key("sk", attr_s(sk))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch instructions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let content = result
        .item()
        .and_then(|item| item.get("content"))
        .and_then(|v| v.as_s().ok())
        .cloned()
        .unwrap_or_default();

    Ok(Json(json!({ "content": content })))
}

async fn update_instructions_inner(
    state: &AppState,
    tenant_id: &str,
    sk: &str,
    content: &str,
) -> Result<StatusCode, StatusCode> {
    if content.len() > MAX_INSTRUCTIONS_BYTES {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    state
        .dynamo
        .put_item()
        .table_name(&state.config.table_name)
        .item("pk", attr_s(tenant_id))
        .item("sk", attr_s(sk))
        .item("content", attr_s(content))
        .item(
            "updated_at",
            attr_s(&chrono::Utc::now().to_rfc3339()),
        )
        .send()
        .await
        .map_err(|e| {
            error!("Failed to update instructions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}
