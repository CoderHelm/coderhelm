import * as cdk from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

interface WafStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * WAFv2 Web ACL for the landing page CloudFront distribution.
 *
 * Must be deployed in us-east-1 since CloudFront is global.
 * Uses free AWS managed rule groups + rate limiting + bot blocking.
 */
export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, props);

    const prefix = `d3ftly-${props.stage}`;

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: `${prefix}-site-waf`,
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-site-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        // ── Rule 1: Rate limiting per IP — 2000 req/5min ──
        {
          name: "RateLimit",
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-site-rate-limit`,
            sampledRequestsEnabled: true,
          },
        },

        // ── Rule 2: AWS Managed — Common Rule Set (free tier) ──
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-site-common-rules`,
            sampledRequestsEnabled: true,
          },
        },

        // ── Rule 3: AWS Managed — Known Bad Inputs (free tier) ──
        {
          name: "AWSManagedRulesKnownBadInputsRuleSet",
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-site-bad-inputs`,
            sampledRequestsEnabled: true,
          },
        },

        // ── Rule 4: AWS Managed — Amazon IP Reputation List (free tier) ──
        {
          name: "AWSManagedRulesAmazonIpReputationList",
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-site-ip-reputation`,
            sampledRequestsEnabled: true,
          },
        },

        // ── Rule 5: Block common bot/scanner user-agents ──
        {
          name: "BlockBadBots",
          priority: 5,
          action: { block: {} },
          statement: {
            regexPatternSetReferenceStatement: {
              arn: new wafv2.CfnRegexPatternSet(this, "BotPatterns", {
                scope: "CLOUDFRONT",
                regularExpressionList: [
                  {
                    regexString:
                      "(?i)(scrapy|httpclient|python-urllib|python-requests|curl\\/|wget\\/|go-http|nikto|sqlmap|nmap|masscan|zgrab)",
                  },
                ],
              }).attrArn,
              fieldToMatch: {
                singleHeader: { name: "user-agent" },
              },
              textTransformations: [{ priority: 0, type: "NONE" }],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-site-bad-bots`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, "WebAclArn", {
      value: webAcl.attrArn,
    });
  }
}
