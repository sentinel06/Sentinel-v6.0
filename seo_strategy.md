# SEO Strategy

## In scope
- Public marketing landing page (`/`)
- Public authentication entry points (`/sign-in`, `/sign-up`) where crawl/indexation behavior can affect SEO
- Crawl-control and discovery files (`robots.txt`, `sitemap.xml`, `llms.txt`)
- Static social metadata and structured data emitted in the public HTML shell

## Out of scope
- Authenticated dashboard routes (`/dashboard`, `/onboarding`, `/settings`, `/traces`, `/topology`, `/warroom`, `/agents`, `/registry`, `/compliance`, `/integrity`, `/badge`, `/swarmmap`, `/partner`, `/partner-onboarding`, `/eqa`, `/pulse`, `/status`, `/support`)
- Internal/admin/API-only routes that are not intended as indexable marketing surfaces

## Indexation intent
- The homepage (`/`) is the primary canonical marketing URL intended to rank in search today.
- Authentication entry points (`/sign-in`, `/sign-up`) should remain non-indexable.
- Account/setup flows such as `/onboarding` and `/settings` are not public SEO targets and should stay gated.

## Target audience
- Enterprise teams evaluating governance, compliance, monitoring, and auditability for AI agents
- Security, compliance, platform, and engineering stakeholders

## Primary keywords
- AI agent governance
- AI audit trail
- immutable audit ledger for AI agents
- AI compliance monitoring
- EU AI Act compliance for AI agents

## Dismissed categories
- (None yet)
