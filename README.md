# AWS Bedrock ATS Analyzer

[![Live Demo](https://img.shields.io/badge/Live%20Demo-AWS%20CloudFront-FF9900?style=for-the-badge&logo=amazonaws)](https://dlyw53evv28n0.cloudfront.net/)

A full-stack serverless application that acts as an Applicant Tracking System (ATS) analyzer. This project aims to seamlessly compare a candidate's resume (PDF) against a Job Description and dynamically provide an ATS match score, matching/missing keywords, and actionable feedback.

This project uses **Amazon Bedrock** (running the `moonshotai.kimi-k2.5` foundation model) alongside a Serverless AWS Infrastructure deployed entirely via the **AWS Cloud Development Kit (CDK)** in Python.

---

## 🏗️ Architecture

The infrastructure is entirely serverless, ensuring high scalability, zero maintenance, and a pay-as-you-go pricing model (with built-in AWS Free Tier optimizations).

```mermaid
flowchart TD
    %% User Interactions
    User((User)) -->|Visits Website| CF[Amazon CloudFront\nGlobal CDN]
    User -.->|Uploads Resume / JD| API[Amazon API Gateway\nHTTP API]
    
    %% Frontend Subsystem
    subgraph Frontend [Static Web Hosting]
        CF -->|Origin Access Control| S3[(Amazon S3 Bucket\nFrontend Assets)]
    end
    
    %% Backend Subsystem
    subgraph Backend [Serverless API & AI]
        API ===>|POST /analyze| L[AWS Lambda\nPython Backend]
        L ===>|boto3 converse| B{Amazon Bedrock\nmoonshotai.kimi-k2.5}
        
        %% Architecture Optimizations
        EB([Amazon EventBridge\nCron Rule]) -.-|Pings every 5 mins\nto prevent cold starts| L
        API -.-|Rate Limiting\n5 Burst / 2 RPS| API
    end

    %% Styles
    classDef aws fill:#232f3e,stroke:#f90,stroke-width:2px,color:#fff;
    classDef user fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff;
    classDef ai fill:#0ea5e9,stroke:#0284c7,stroke-width:2px,color:#fff;
    
    class CF,S3,API,L,EB aws;
    class User user;
    class B ai;
```

### Components
1. **Frontend (S3 & CloudFront)**: A vanilla JS/HTML/TailwindCSS frontend using `pdf.js` to extract text client-side. Hosted securely in an S3 Bucket, cached and delivered globally via an Amazon CloudFront distribution.
2. **Backend (API Gateway & Lambda)**: An HTTP API with strict DDoS mitigation (rate limiting throttled at 2 RPS) routing to a Python 3.12 AWS Lambda function.
3. **AI Integration (Amazon Bedrock)**: The Lambda utilizes the new `boto3.client('bedrock-runtime').converse()` API, instructing an AI model to act as a strict Senior Technical Recruiter and output a JSON payload.
4. **Lambda Warmer (EventBridge)**: A free-tier cron job pings the Lambda every 5 minutes and immediately returns `200 OK` (bypassing the AI) to prevent AWS Lambda "Cold Start" user latency.

---

## 🚀 Deployment

The AWS infrastructure is defined natively using AWS CDK (v2) Python constructs. The single command deploys both the backend and frontend simultaneously.

### Prerequisites
- Node.js (for AWS CDK CLI)
- Python 3.12+
- Docker (for the `PythonFunction` construct if bundling dependencies)
- Boto3 / AWS CLI credentials configured

### Setup and Deploy

1. **Clone the repository and set up a Virtual Environment**:
   ```bash
   git clone <repo-url>
   cd aws-bedrock-ats-analyzer
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Bootstrap the AWS Account** (if you haven't used CDK in this region):
   ```bash
   cdk bootstrap
   ```

3. **Deploy the full stack**:
   ```bash
   cdk deploy --context stage=prod
   ```
   > During deployment, CDK will provision the backend, spin up an edge network, bundle the local `frontend/` directory, and automatically upload the static assets into the newly created S3 Bucket.

4. **Verify Deployment**:
   After CDK synthesizes, look for the CloudFormation `Outputs` block in your terminal:
   - `AwsBedrockAtsAnalyzerStack-prod.CloudFrontDomain`: Navigate to this URL to view the live web interface.

---

## 🛡️ Security
This stack implements multiple layers of AWS best practices:
- **Least Privilege IAM**: The Lambda execution role is strictly scoped to `bedrock:InvokeModel` only for the declared foundation model ARN.
- **Origin Access Control (OAC)**: The S3 static website bucket explicitly denies all public access and enforces that files can only be read via the CloudFront distribution origin.
- **DDoS Mitigation**: API Gateway is configured with a strict `throttling_rate_limit` wrapper to protect against "Denial of Wallet" spam attacks targeting the AI endpoint. 
