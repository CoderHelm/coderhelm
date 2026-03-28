use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::Value;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::auth::verify::verify_github_signature;
use crate::models::{TicketMessage, TicketSource, WorkerMessage, CiFixMessage, FeedbackMessage, OnboardMessage, OnboardRepo};
use crate::AppState;

pub async fn handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    // Verify signature
    let signature = headers
        .get("x-hub-signature-256")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !verify_github_signature(&state.secrets.github_webhook_secret, &body, signature) {
        warn!("Invalid GitHub webhook signature");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let event_type = headers
        .get("x-github-event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    let payload: Value = serde_json::from_slice(&body).map_err(|e| {
        error!("Failed to parse webhook body: {e}");
        StatusCode::BAD_REQUEST
    })?;

    let installation_id = payload["installation"]["id"]
        .as_u64()
        .ok_or(StatusCode::BAD_REQUEST)?;

    info!(event_type, installation_id, "GitHub webhook received");

    match event_type {
        "issues" => handle_issue_event(&state, &payload, installation_id).await,
        "issue_comment" => handle_issue_comment(&state, &payload, installation_id).await,
        "pull_request_review" => handle_pr_review(&state, &payload, installation_id).await,
        "check_run" => handle_check_run(&state, &payload, installation_id).await,
        "installation" => handle_installation(&state, &payload, installation_id).await,
        "installation_repositories" => {
            handle_installation_repos(&state, &payload, installation_id).await
        }
        _ => {
            info!(event_type, "Ignoring unhandled event type");
            Ok(StatusCode::OK)
        }
    }
}

async fn handle_issue_event(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");

    // Trigger on: issue assigned to d3ftly[bot], or labeled "d3ftly"
    let is_assigned_to_bot = action == "assigned"
        && payload["assignee"]["login"]
            .as_str()
            .map(|l| l.contains("d3ftly"))
            .unwrap_or(false);

    let is_labeled = action == "labeled"
        && payload["label"]["name"]
            .as_str()
            .map(|l| l == "d3ftly")
            .unwrap_or(false);

    if !is_assigned_to_bot && !is_labeled {
        return Ok(StatusCode::OK);
    }

    let tenant_id = format!("TENANT#{installation_id}");
    let issue = &payload["issue"];
    let repo = &payload["repository"];

    let message = WorkerMessage::Ticket(TicketMessage {
        tenant_id: tenant_id.clone(),
        installation_id,
        source: TicketSource::Github,
        ticket_id: format!("GH-{}", issue["number"].as_u64().unwrap_or(0)),
        title: issue["title"].as_str().unwrap_or("").to_string(),
        body: issue["body"].as_str().unwrap_or("").to_string(),
        repo_owner: repo["owner"]["login"].as_str().unwrap_or("").to_string(),
        repo_name: repo["name"].as_str().unwrap_or("").to_string(),
        issue_number: issue["number"].as_u64().unwrap_or(0),
        sender: payload["sender"]["login"].as_str().unwrap_or("").to_string(),
    });

    send_to_queue(state, &state.config.ticket_queue_url, &message).await
}

async fn handle_issue_comment(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");
    if action != "created" {
        return Ok(StatusCode::OK);
    }

    let body = payload["comment"]["body"].as_str().unwrap_or("");

    // Trigger on `/d3ftly` slash command
    if !body.starts_with("/d3ftly") {
        return Ok(StatusCode::OK);
    }

    let tenant_id = format!("TENANT#{installation_id}");
    let issue = &payload["issue"];
    let repo = &payload["repository"];

    let message = WorkerMessage::Ticket(TicketMessage {
        tenant_id,
        installation_id,
        source: TicketSource::Github,
        ticket_id: format!("GH-{}", issue["number"].as_u64().unwrap_or(0)),
        title: issue["title"].as_str().unwrap_or("").to_string(),
        body: issue["body"].as_str().unwrap_or("").to_string(),
        repo_owner: repo["owner"]["login"].as_str().unwrap_or("").to_string(),
        repo_name: repo["name"].as_str().unwrap_or("").to_string(),
        issue_number: issue["number"].as_u64().unwrap_or(0),
        sender: payload["sender"]["login"].as_str().unwrap_or("").to_string(),
    });

    send_to_queue(state, &state.config.ticket_queue_url, &message).await
}

async fn handle_pr_review(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");
    if action != "submitted" {
        return Ok(StatusCode::OK);
    }

    // Only process reviews on our PRs
    let pr_user = payload["pull_request"]["user"]["login"].as_str().unwrap_or("");
    if !pr_user.contains("d3ftly") {
        return Ok(StatusCode::OK);
    }

    let tenant_id = format!("TENANT#{installation_id}");
    let repo = &payload["repository"];

    let message = WorkerMessage::Feedback(FeedbackMessage {
        tenant_id,
        installation_id,
        run_id: String::new(), // TODO: look up from DynamoDB by PR number
        repo_owner: repo["owner"]["login"].as_str().unwrap_or("").to_string(),
        repo_name: repo["name"].as_str().unwrap_or("").to_string(),
        pr_number: payload["pull_request"]["number"].as_u64().unwrap_or(0),
        review_id: payload["review"]["id"].as_u64().unwrap_or(0),
        review_body: payload["review"]["body"].as_str().unwrap_or("").to_string(),
        comments: vec![], // TODO: fetch review comments via API
    });

    send_to_queue(state, &state.config.feedback_queue_url, &message).await
}

async fn handle_check_run(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");
    if action != "completed" {
        return Ok(StatusCode::OK);
    }

    let conclusion = payload["check_run"]["conclusion"].as_str().unwrap_or("");
    if conclusion != "failure" {
        return Ok(StatusCode::OK);
    }

    // Only fix CI on our branches
    let branch = payload["check_run"]["check_suite"]["head_branch"]
        .as_str()
        .unwrap_or("");
    if !branch.starts_with("d3ftly/") {
        return Ok(StatusCode::OK);
    }

    let tenant_id = format!("TENANT#{installation_id}");
    let repo = &payload["repository"];

    let message = WorkerMessage::CiFix(CiFixMessage {
        tenant_id,
        installation_id,
        run_id: String::new(), // TODO: look up from DynamoDB by branch
        repo_owner: repo["owner"]["login"].as_str().unwrap_or("").to_string(),
        repo_name: repo["name"].as_str().unwrap_or("").to_string(),
        branch: branch.to_string(),
        pr_number: 0, // TODO: look up
        check_run_id: payload["check_run"]["id"].as_u64().unwrap_or(0),
        attempt: 1,
    });

    send_to_queue(state, &state.config.ci_fix_queue_url, &message).await
}

async fn handle_installation(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");

    match action {
        "created" => {
            // New tenant! Provision in DynamoDB.
            let org = payload["installation"]["account"]["login"]
                .as_str()
                .unwrap_or("unknown");
            info!(installation_id, org, "New GitHub App installation — provisioning tenant");

            let now = chrono::Utc::now().to_rfc3339();
            state
                .dynamo
                .put_item()
                .table_name(&state.config.table_name)
                .item("pk", attr_s(&format!("TENANT#{installation_id}")))
                .item("sk", attr_s("META"))
                .item("github_install_id", attr_n(installation_id))
                .item("github_org", attr_s(org))
                .item("plan", attr_s("free"))
                .item("status", attr_s("active"))
                .item("run_count_mtd", attr_n(0))
                .item("created_at", attr_s(&now))
                .send()
                .await
                .map_err(|e| {
                    error!("Failed to create tenant: {e}");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            // Enqueue onboard for all repos in the installation
            let repos = extract_repos_from_installation(payload);
            if !repos.is_empty() {
                let onboard = WorkerMessage::Onboard(OnboardMessage {
                    tenant_id: format!("TENANT#{installation_id}"),
                    installation_id,
                    repos,
                });
                let _ = send_to_queue(state, &state.config.ticket_queue_url, &onboard).await;
            }

            Ok(StatusCode::CREATED)
        }
        "deleted" => {
            info!(installation_id, "GitHub App uninstalled — deactivating tenant");
            state
                .dynamo
                .update_item()
                .table_name(&state.config.table_name)
                .key("pk", attr_s(&format!("TENANT#{installation_id}")))
                .key("sk", attr_s("META"))
                .update_expression("SET #status = :s")
                .expression_attribute_names("#status", "status")
                .expression_attribute_values(":s", attr_s("deactivated"))
                .send()
                .await
                .map_err(|e| {
                    error!("Failed to deactivate tenant: {e}");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            Ok(StatusCode::OK)
        }
        _ => Ok(StatusCode::OK),
    }
}

async fn handle_installation_repos(
    state: &AppState,
    payload: &Value,
    installation_id: u64,
) -> Result<StatusCode, StatusCode> {
    let action = payload["action"].as_str().unwrap_or("");
    if action != "added" {
        return Ok(StatusCode::OK);
    }

    let repos: Vec<OnboardRepo> = payload["repositories_added"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|r| {
            let full_name = r["full_name"].as_str()?;
            let parts: Vec<&str> = full_name.splitn(2, '/').collect();
            if parts.len() != 2 {
                return None;
            }
            Some(OnboardRepo {
                owner: parts[0].to_string(),
                name: parts[1].to_string(),
                default_branch: r["default_branch"]
                    .as_str()
                    .unwrap_or("main")
                    .to_string(),
            })
        })
        .collect();

    if repos.is_empty() {
        return Ok(StatusCode::OK);
    }

    let onboard = WorkerMessage::Onboard(OnboardMessage {
        tenant_id: format!("TENANT#{installation_id}"),
        installation_id,
        repos,
    });

    send_to_queue(state, &state.config.ticket_queue_url, &onboard).await
}

fn extract_repos_from_installation(payload: &Value) -> Vec<OnboardRepo> {
    payload["repositories"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|r| {
            let full_name = r["full_name"].as_str()?;
            let parts: Vec<&str> = full_name.splitn(2, '/').collect();
            if parts.len() != 2 {
                return None;
            }
            Some(OnboardRepo {
                owner: parts[0].to_string(),
                name: parts[1].to_string(),
                default_branch: r["default_branch"]
                    .as_str()
                    .unwrap_or("main")
                    .to_string(),
            })
        })
        .collect()
}

async fn send_to_queue(
    state: &AppState,
    queue_url: &str,
    message: &WorkerMessage,
) -> Result<StatusCode, StatusCode> {
    let body = serde_json::to_string(message).map_err(|e| {
        error!("Failed to serialize message: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state
        .sqs
        .send_message()
        .queue_url(queue_url)
        .message_body(&body)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to send SQS message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!("Dispatched to SQS");
    Ok(StatusCode::ACCEPTED)
}

// DynamoDB attribute helpers
fn attr_s(val: &str) -> aws_sdk_dynamodb::types::AttributeValue {
    aws_sdk_dynamodb::types::AttributeValue::S(val.to_string())
}

fn attr_n(val: impl std::fmt::Display) -> aws_sdk_dynamodb::types::AttributeValue {
    aws_sdk_dynamodb::types::AttributeValue::N(val.to_string())
}
