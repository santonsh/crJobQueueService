# Production Deployment Strategy

This document outlines the production deployment approach for the Job Queue Service on AWS.

## Deployment

- We can run the API, monitor, and workers on **EKS** (Elastic Kubernetes Service) or **ECS** (Elastic Container Service) cluster
- The database and Redis should be deployed as dedicated managed instances in AWS:
  - **RDS** (Relational Database Service) for PostgreSQL
  - **ElastiCache** for Redis
- Database connection credentials should be stored in **AWS Secrets Manager** or **AWS Systems Manager Parameter Store** (if we consider job management DB not secret enough)
- Parameters can be either baked into the CI/CD pipeline or stored in Parameter Store where we can control them without touching the pipeline
- Logging should be available via AWS native cloud logging (**CloudWatch**)
- Horizontal scaling can be implemented natively in EKS/ECS using:
  - Queue depth metrics for workers
  - Average CPU/memory utilization metrics for API
- API layer should have a load balancer (**Application Load Balancer - ALB**) and be protected via **API Gateway** if accessible from outside
- API, worker, and monitor instances should have **IAM roles** to be able to read relevant AWS parameters and secrets
- Worker should have IAM permissions to read relevant secrets if relevant to job execution

## CI/CD

- CI/CD would pick the code push/merge to `master`/`qa` branch and build images to **ECR** (Elastic Container Registry) in the build stage
- In the deploy step, update EKS pods or ECS task definitions with new images
- The CI/CD pipeline may need to also update parameters in Parameter Store
- The CI/CD pipeline may run functional tests after deployment
- Since API/worker/monitor are linked via monorepo implementation, they should be released together for ease of DevOps management

## Metrics and Alerts

- We can use AWS native metrics built on:
  - Instance utilization metrics: CPU/memory
  - Errors and warnings in **CloudWatch Logs**
  - Redis and database resource metrics (**ElastiCache** and **RDS** CloudWatch metrics)
  - Application-specific metrics: queue depth, job processing rates, success/failure rates
- Alerts can be configured via **CloudWatch Alarms** with notifications to **SNS** (Simple Notification Service) for PagerDuty/Slack integration

## Further Quality Improvements

### Blue/Green or Canary Deployments


### Multireguional deployement
- If the application is multiregional already and business logic region-spit or complexity of multiregional split of job queue service is worth it the ecs ekr clusters can be deployed in several regions to improve availability and latency

**Personal Note:** While I understand the concepts and benefits of blue/green and canary deployments theoretically, I lack hands-on production experience implementing these strategies. I would need to more time with documentation and playing around to implement such a setup myself