# Development and change acceptance

Every change must be reviewable against the affected requirement and its acceptance evidence. This project uses the following minimum standard for feature, security, and data-model work.

## Before implementation

- Identify the relevant master requirement number and the user-visible or API behavior being changed.
- Define success and failure cases, including authorization, invalid input, provider/database failure, and empty states where relevant.
- Identify data written, its owner/organization/site scope, retention needs, and whether any value is a secret or personal information.
- For external integrations, document required scopes, configuration, quotas, and a safe way to test without production credentials.

## During implementation

- Keep server-side authorization at every read/write boundary; do not rely on hiding UI controls.
- Bound and validate untrusted input. Treat crawled pages, provider data, plugin payloads, and AI output as untrusted.
- Store an actor and resource scope for material mutations. Keep secret values out of logs, exports, and error responses.
- Make retries safe where a request or job can run more than once. Use explicit status transitions and preserve enough history to investigate changes.
- Provide loading, success, empty, and actionable error states for user-facing operations.

## Required evidence before merge

1. Add or update automated tests for changed behavior and important failure/security cases. Do not claim coverage for an external provider unless a real-account test was run.
2. Run the CI checks: unit tests, TypeScript, lint, and production build.
3. Review authorization, validation, secret handling, persistence scope, audit coverage, and accessible UI behavior for the touched code.
4. Update the relevant row in `MASTER-REQUIREMENTS-STATUS.md`, this document if the standard changes, and the release plan when a gate changes.
5. Record checks that could not run and why. A passing build is not evidence of provider, browser, load, deployment, or recovery behavior.

## Release blocking conditions

- Any failing CI job, unresolved critical/high security issue, or unexplained data-scope defect blocks release.
- Destructive data operations require a verified ownership check, an explicit confirmation step, and a tested recovery or documented irreversibility decision.
- Production credentials must be configured through the deployment secret store, never committed to the repository or CI workflow.
- A feature remains partially built until its listed acceptance evidence and dependencies are verified.
