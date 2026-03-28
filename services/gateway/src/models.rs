use serde::{Deserialize, Serialize};

/// App configuration from environment variables.
pub struct Config {
    pub stage: String,
    pub table_name: String,
    pub bucket_name: String,
    pub ticket_queue_url: String,
    pub ci_fix_queue_url: String,
    pub feedback_queue_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            stage: std::env::var("STAGE").unwrap_or_else(|_| "dev".to_string()),
            table_name: std::env::var("TABLE_NAME").expect("TABLE_NAME required"),
            bucket_name: std::env::var("BUCKET_NAME").expect("BUCKET_NAME required"),
            ticket_queue_url: std::env::var("TICKET_QUEUE_URL").expect("TICKET_QUEUE_URL required"),
            ci_fix_queue_url: std::env::var("CI_FIX_QUEUE_URL").expect("CI_FIX_QUEUE_URL required"),
            feedback_queue_url: std::env::var("FEEDBACK_QUEUE_URL")
                .expect("FEEDBACK_QUEUE_URL required"),
        }
    }
}

/// Secrets loaded from AWS Secrets Manager.
#[derive(Deserialize)]
pub struct Secrets {
    pub github_app_id: String,
    pub github_private_key: String,
    pub github_webhook_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub jwt_secret: String,
    #[serde(default)]
    pub jira_webhook_secret: Option<String>,
    #[serde(default)]
    pub stripe_webhook_secret: Option<String>,
}

impl Secrets {
    pub async fn load(
        client: &aws_sdk_secretsmanager::Client,
        name: &str,
    ) -> Result<Self, lambda_http::Error> {
        let response = client.get_secret_value().secret_id(name).send().await?;
        let secret_string = response
            .secret_string()
            .ok_or_else(|| "Secret has no string value")?;
        let secrets: Secrets = serde_json::from_str(secret_string)?;
        Ok(secrets)
    }
}

/// SQS message types sent from gateway → worker.
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum WorkerMessage {
    #[serde(rename = "ticket")]
    Ticket(TicketMessage),
    #[serde(rename = "ci_fix")]
    CiFix(CiFixMessage),
    #[serde(rename = "feedback")]
    Feedback(FeedbackMessage),
    #[serde(rename = "onboard")]
    Onboard(OnboardMessage),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketMessage {
    pub tenant_id: String,
    pub installation_id: u64,
    pub source: TicketSource,
    pub ticket_id: String,
    pub title: String,
    pub body: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub issue_number: u64,
    pub sender: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum TicketSource {
    Github,
    Jira,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CiFixMessage {
    pub tenant_id: String,
    pub installation_id: u64,
    pub run_id: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub branch: String,
    pub pr_number: u64,
    pub check_run_id: u64,
    pub attempt: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FeedbackMessage {
    pub tenant_id: String,
    pub installation_id: u64,
    pub run_id: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub pr_number: u64,
    pub review_id: u64,
    pub review_body: String,
    pub comments: Vec<ReviewComment>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ReviewComment {
    pub path: String,
    pub line: Option<u64>,
    pub body: String,
}

/// JWT claims for authenticated dashboard sessions.
#[derive(Serialize, Deserialize, Debug)]
pub struct Claims {
    pub sub: String,         // user_id
    pub tenant_id: String,
    pub github_login: String,
    pub exp: u64,
    pub iat: u64,
}

/// DynamoDB item types.
#[derive(Serialize, Deserialize, Debug)]
pub struct Tenant {
    pub pk: String,         // TENANT#<install_id>
    pub sk: String,         // META
    pub github_install_id: u64,
    pub github_org: String,
    pub plan: String,       // "free" | "supporter"
    pub status: String,     // "active" | "suspended"
    pub run_count_mtd: u32, // month-to-date run count
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RunRecord {
    pub pk: String,         // TENANT#<install_id>
    pub sk: String,         // RUN#<ulid>
    pub run_id: String,
    pub tenant_id: String,
    pub status: String,     // "pending" | "running" | "completed" | "failed"
    pub ticket_source: String,
    pub ticket_id: String,
    pub title: String,
    pub repo: String,
    pub branch: Option<String>,
    pub pr_url: Option<String>,
    pub pr_number: Option<u64>,
    pub current_pass: Option<String>,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost_usd: f64,
    pub files_modified: Vec<String>,
    pub duration_s: Option<u64>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

// --- Onboard types ---

#[derive(Serialize, Deserialize, Debug)]
pub struct OnboardMessage {
    pub tenant_id: String,
    pub installation_id: u64,
    pub repos: Vec<OnboardRepo>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OnboardRepo {
    pub owner: String,
    pub name: String,
    pub default_branch: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_message_roundtrip() {
        let msg = WorkerMessage::Ticket(TicketMessage {
            tenant_id: "TENANT#1".into(),
            installation_id: 1,
            source: TicketSource::Github,
            ticket_id: "GH-42".into(),
            title: "Fix bug".into(),
            body: "details".into(),
            repo_owner: "org".into(),
            repo_name: "repo".into(),
            issue_number: 42,
            sender: "user".into(),
        });
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: WorkerMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, WorkerMessage::Ticket(_)));
    }

    #[test]
    fn onboard_message_roundtrip() {
        let msg = WorkerMessage::Onboard(OnboardMessage {
            tenant_id: "TENANT#1".into(),
            installation_id: 1,
            repos: vec![OnboardRepo {
                owner: "org".into(),
                name: "repo".into(),
                default_branch: "main".into(),
            }],
        });
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: WorkerMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, WorkerMessage::Onboard(_)));
    }

    #[test]
    fn secrets_serde() {
        let json = r#"{
            "github_app_id":"1",
            "github_private_key":"k",
            "github_webhook_secret":"ws",
            "github_client_id":"ci",
            "github_client_secret":"cs",
            "jwt_secret":"js"
        }"#;
        let s: Secrets = serde_json::from_str(json).unwrap();
        assert_eq!(s.github_app_id, "1");
        assert!(s.jira_webhook_secret.is_none());
    }

    #[test]
    fn claims_roundtrip() {
        let c = Claims {
            sub: "user1".into(),
            tenant_id: "TENANT#1".into(),
            github_login: "octocat".into(),
            exp: 9999999999,
            iat: 1000000000,
        };
        let json = serde_json::to_string(&c).unwrap();
        let parsed: Claims = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.sub, "user1");
    }
}
