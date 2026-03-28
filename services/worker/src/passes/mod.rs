use crate::clients::github::GitHubClient;
use crate::models::{TicketMessage, TokenUsage};
use crate::WorkerState;
use tracing::{error, info};

pub mod ci_fix;
pub mod feedback;
mod implement;
pub mod onboard;
mod plan;
mod pr;
mod review;
mod triage;

/// Main orchestration: run all passes for a new ticket.
pub async fn orchestrate_ticket(
    state: &WorkerState,
    msg: TicketMessage,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let run_id = ulid::Ulid::new().to_string();
    let mut usage = TokenUsage::default();
    let start = std::time::Instant::now();

    info!(run_id, ticket_id = %msg.ticket_id, "Orchestration started");

    // Create run record
    create_run_record(state, &msg, &run_id).await?;

    // Initialize GitHub client for this tenant
    let github = GitHubClient::new(
        &state.secrets.github_app_id,
        &state.secrets.github_private_key,
        msg.installation_id,
        &state.http,
    )?;

    // Post "working on it" comment on the issue
    github
        .create_issue_comment(
            &msg.repo_owner,
            &msg.repo_name,
            msg.issue_number,
            &format!(
                "🔄 **d3ftly is working on this**\n\n| Phase | Status |\n|-------|--------|\n| Triage | 🔄 In progress |\n| Plan | ⏳ Pending |\n| Implement | ⏳ Pending |\n| Review | ⏳ Pending |\n| PR | ⏳ Pending |\n\n[View run →](https://app.d3ftly.com/dashboard/runs/{})",
                run_id,
            ),
        )
        .await?;

    // --- Pass 1: Triage ---
    update_pass(state, &msg.tenant_id, &run_id, "triage").await?;
    let triage_result = triage::run(state, &msg, &github, &mut usage).await?;
    info!(run_id, "Triage complete");

    // --- Pass 2: Plan ---
    update_pass(state, &msg.tenant_id, &run_id, "plan").await?;
    let plan_result = plan::run(state, &msg, &github, &triage_result, &mut usage).await?;
    info!(run_id, "Plan complete");

    // --- Pass 3: Implement ---
    update_pass(state, &msg.tenant_id, &run_id, "implement").await?;
    let branch_name = format!("d3ftly/{}", msg.ticket_id.to_lowercase());
    let impl_result =
        implement::run(state, &msg, &github, &plan_result, &branch_name, &mut usage).await?;
    info!(run_id, files = impl_result.files_modified.len(), "Implement complete");

    // --- Pass 4: Review ---
    update_pass(state, &msg.tenant_id, &run_id, "review").await?;
    review::run(state, &msg, &github, &branch_name, &mut usage).await?;
    info!(run_id, "Review complete");

    // --- Pass 5: Create PR ---
    update_pass(state, &msg.tenant_id, &run_id, "pr").await?;
    let pr_result =
        pr::run(state, &msg, &github, &branch_name, &plan_result, &mut usage).await?;
    info!(run_id, pr_url = %pr_result.pr_url, "PR created");

    // Update run record with final state
    let duration = start.elapsed().as_secs();
    complete_run(state, &msg, &run_id, &pr_result, &impl_result, &usage, duration).await?;

    // Post success comment on issue
    github
        .create_issue_comment(
            &msg.repo_owner,
            &msg.repo_name,
            msg.issue_number,
            &format!(
                "✅ **d3ftly completed this ticket**\n\n**PR**: {}\n**Files**: {} modified\n**Time**: {}m {}s\n**Cost**: ${:.2}\n\n[View run →](https://app.d3ftly.com/dashboard/runs/{})",
                pr_result.pr_url,
                impl_result.files_modified.len(),
                duration / 60,
                duration % 60,
                usage.estimated_cost(),
                run_id,
            ),
        )
        .await?;

    Ok(())
}

async fn create_run_record(
    state: &WorkerState,
    msg: &TicketMessage,
    run_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now().to_rfc3339();
    state
        .dynamo
        .put_item()
        .table_name(&state.config.table_name)
        .item("pk", attr_s(&msg.tenant_id))
        .item("sk", attr_s(&format!("RUN#{run_id}")))
        .item("run_id", attr_s(run_id))
        .item("tenant_id", attr_s(&msg.tenant_id))
        .item("status", attr_s("running"))
        .item("ticket_source", attr_s("github"))
        .item("ticket_id", attr_s(&msg.ticket_id))
        .item("title", attr_s(&msg.title))
        .item("repo", attr_s(&format!("{}/{}", msg.repo_owner, msg.repo_name)))
        .item("tokens_in", attr_n(0))
        .item("tokens_out", attr_n(0))
        .item("cost_usd", attr_n(0))
        .item("created_at", attr_s(&now))
        .item("updated_at", attr_s(&now))
        .send()
        .await?;
    Ok(())
}

async fn update_pass(
    state: &WorkerState,
    tenant_id: &str,
    run_id: &str,
    pass: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now().to_rfc3339();
    state
        .dynamo
        .update_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(tenant_id))
        .key("sk", attr_s(&format!("RUN#{run_id}")))
        .update_expression("SET current_pass = :p, updated_at = :t")
        .expression_attribute_values(":p", attr_s(pass))
        .expression_attribute_values(":t", attr_s(&now))
        .send()
        .await?;
    Ok(())
}

async fn complete_run(
    state: &WorkerState,
    msg: &TicketMessage,
    run_id: &str,
    pr: &pr::PrResult,
    impl_result: &implement::ImplementResult,
    usage: &TokenUsage,
    duration: u64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now().to_rfc3339();
    state
        .dynamo
        .update_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(&msg.tenant_id))
        .key("sk", attr_s(&format!("RUN#{run_id}")))
        .update_expression(
            "SET #status = :s, pr_url = :pr, pr_number = :pn, branch = :b, \
             tokens_in = :ti, tokens_out = :to, cost_usd = :c, \
             duration_s = :d, updated_at = :t, current_pass = :cp",
        )
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":s", attr_s("completed"))
        .expression_attribute_values(":pr", attr_s(&pr.pr_url))
        .expression_attribute_values(":pn", attr_n(pr.pr_number))
        .expression_attribute_values(":b", attr_s(&pr.branch))
        .expression_attribute_values(":ti", attr_n(usage.input_tokens))
        .expression_attribute_values(":to", attr_n(usage.output_tokens))
        .expression_attribute_values(":c", attr_n(format!("{:.4}", usage.estimated_cost())))
        .expression_attribute_values(":d", attr_n(duration))
        .expression_attribute_values(":t", attr_s(&now))
        .expression_attribute_values(":cp", attr_s("done"))
        .send()
        .await?;

    // Increment tenant's monthly run count
    state
        .dynamo
        .update_item()
        .table_name(&state.config.table_name)
        .key("pk", attr_s(&msg.tenant_id))
        .key("sk", attr_s("META"))
        .update_expression("ADD run_count_mtd :one")
        .expression_attribute_values(":one", attr_n(1))
        .send()
        .await?;

    Ok(())
}

fn attr_s(val: &str) -> aws_sdk_dynamodb::types::AttributeValue {
    aws_sdk_dynamodb::types::AttributeValue::S(val.to_string())
}

fn attr_n(val: impl std::fmt::Display) -> aws_sdk_dynamodb::types::AttributeValue {
    aws_sdk_dynamodb::types::AttributeValue::N(val.to_string())
}
