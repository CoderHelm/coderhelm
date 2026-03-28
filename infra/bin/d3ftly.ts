#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FrontendStack } from "../lib/frontend-stack";
import { WafStack } from "../lib/waf-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? "654654210434",
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const stage = app.node.tryGetContext("stage") ?? "prod";
const prefix = `d3ftly-${stage}`;

// --- WAF (must be us-east-1 for CloudFront) ---

const waf = new WafStack(app, `${prefix}-landing-waf`, {
  env: { account: env.account, region: "us-east-1" },
  stage,
  crossRegionReferences: true,
});

// --- Landing Page ---

new FrontendStack(app, `${prefix}-frontend`, {
  env,
  stage,
  webAclArn: waf.webAclArn,
  crossRegionReferences: true,
});
