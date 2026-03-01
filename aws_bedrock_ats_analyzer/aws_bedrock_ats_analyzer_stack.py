from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_iam as iam,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3_deployment as s3deploy,
    aws_events as events,
    aws_events_targets as targets,
    CfnOutput
)
from aws_cdk import aws_lambda as lambda_
from aws_cdk.aws_lambda_python_alpha import PythonFunction

from aws_cdk import aws_apigatewayv2 as apigw2
from aws_cdk import aws_apigatewayv2_integrations as integrations

import os
from constructs import Construct
import json


class AwsBedrockAtsAnalyzerStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # ========================================================
        # 0) LOAD CONTEXT CONFIG (from config.json)
        # ========================================================
        stage = self.node.try_get_context("stage") or "prod"
        
        config_path = os.path.join(os.path.dirname(__file__), "../config.json")
        with open(config_path, "r") as f:
            all_config = json.load(f)
            
        config = all_config.get(stage)
        if not config:
            raise ValueError(f"Missing config for stage: {stage}. check config.json")
        
        print(f"🚀 Deploying Stage: {stage}")
        api_name = config.get("api_name", "AwsBedrockAtsAnalyzerHTTPApi")

        # ========================================================
        # 1) HTTP API
        # ========================================================
        self.api = apigw2.HttpApi(
            self,
            "AtsAnalyzerHttpApi",
            api_name=api_name,
            cors_preflight=apigw2.CorsPreflightOptions(
                allow_origins=["*"],
                allow_methods=[apigw2.CorsHttpMethod.ANY],
                allow_headers=["*"],
                expose_headers=["*"],
                max_age=Duration.seconds(3600),
            ),
        )

        # ========================================================
        # 2) LAMBDA FUNCTION (ATS ANALYZER)
        # ========================================================
        self.ats_analyzer_fn = PythonFunction(
            self,
            "AtsAnalyzerFunction",
            entry=os.path.join(os.path.dirname(__file__), "../lambda/ats_analyzer"),
            index="handler.py",
            handler="lambda_handler",
            runtime=lambda_.Runtime.PYTHON_3_12,
            architecture=lambda_.Architecture.X86_64,
            timeout=Duration.seconds(30),
            memory_size=512,
            environment={
                "BEDROCK_MODEL_ID": "moonshotai.kimi-k2.5",
            },
        )

        # ========================================================
        # 3) IAM PERMISSIONS (Bedrock Invoke)
        # ========================================================
        self.ats_analyzer_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:InvokeModel"],
                # Standard Bedrock ARN format for foundation models
                resources=["arn:aws:bedrock:*::foundation-model/moonshotai.kimi-k2.5"],
            )
        )

        # ========================================================
        # 3.5) EVENTBRIDGE WARMER (Ping every 5 mins)
        # ========================================================
        warmer_rule = events.Rule(
            self,
            "AtsAnalyzerWarmerRule",
            schedule=events.Schedule.rate(Duration.minutes(5)),
        )
        warmer_rule.add_target(targets.LambdaFunction(self.ats_analyzer_fn))

        # ========================================================
        # 4) API ROUTES
        # ========================================================
        self.api.add_routes(
            path="/analyze",
            methods=[apigw2.HttpMethod.POST],
            integration=integrations.HttpLambdaIntegration(
                "AtsAnalyzerIntegration",
                handler=self.ats_analyzer_fn,
            ),
        )

        # ========================================================
        # 4.5) API RATE LIMITING (DDoS Protection)
        # ========================================================
        default_stage = self.api.default_stage.node.default_child
        default_stage.default_route_settings = apigw2.CfnStage.RouteSettingsProperty(
            throttling_burst_limit=5,
            throttling_rate_limit=2
        )

        # ========================================================
        # 5) CLOUDFORMATION OUTPUTS (Backend)
        # ========================================================
        CfnOutput(
            self, 
            "ApiUrl", 
            value=self.api.url, 
            description="The URL of the ATS Analyzer HTTP API"
        )

        # =================================================================
        # 6) S3 BUCKET (Frontend)
        # =================================================================
        main_bucket = s3.Bucket(
            self, "FrontendBucket",
            bucket_name=f"ats-analyzer-frontend-{stage}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.DESTROY if stage == "dev" else RemovalPolicy.RETAIN,
            auto_delete_objects=True if stage == "dev" else False,
        )

        # =================================================================
        # 7) CLOUDFRONT DISTRIBUTION (Frontend CDN)
        # =================================================================
        main_origin = origins.S3Origin(main_bucket)

        distribution = cloudfront.Distribution(
            self, "Distribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=main_origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD,
                compress=True,
            ),
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html"
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html"
                )
            ],
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
        )

        # =================================================================
        # 8) FRONTEND S3 DEPLOYMENT (Upload local ./frontend -> S3)
        # =================================================================
        s3deploy.BucketDeployment(
            self, "DeployFrontend",
            sources=[s3deploy.Source.asset(os.path.join(os.path.dirname(__file__), "../frontend"))],
            destination_bucket=main_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )
        
        # =================================================================
        # 9) CLOUDFORMATION OUTPUTS (Frontend)
        # =================================================================
        CfnOutput(self, "CloudFrontDomain", value=distribution.distribution_domain_name)
        CfnOutput(self, "MainBucketOutput", value=main_bucket.bucket_name)
