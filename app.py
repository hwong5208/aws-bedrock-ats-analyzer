#!/usr/bin/env python3
import os

import aws_cdk as cdk

from aws_bedrock_ats_analyzer.aws_bedrock_ats_analyzer_stack import AwsBedrockAtsAnalyzerStack


app = cdk.App()

# Check Stage
stage = app.node.try_get_context("stage") or "prod"

# Dynamic Stack Name: "AwsBedrockAtsAnalyzerStack" (Prod) vs "AwsBedrockAtsAnalyzerStack-dev" (Dev)
stack_id = "AwsBedrockAtsAnalyzerStack"
if stage != "prod":
    stack_id = f"AwsBedrockAtsAnalyzerStack-{stage}"

AwsBedrockAtsAnalyzerStack(app, stack_id,
    # If you don't specify 'env', this stack will be environment-agnostic.
    # Account/Region-dependent features and context lookups will not work,
    # but a single synthesized template can be deployed anywhere.

    # Uncomment the next line to specialize this stack for the AWS Account
    # and Region that are implied by the current CLI configuration.

    env=cdk.Environment(
        account=os.getenv('CDK_DEFAULT_ACCOUNT'), 
        region='us-west-2'
    ),

    # For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
    )

app.synth()
