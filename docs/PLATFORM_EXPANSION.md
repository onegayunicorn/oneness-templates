# ONENESS Platform Expansion

> **Status:** Architecture and roadmap proposal  
> **Source:** User-supplied ONENESS Professional Platform Update  
> **Implementation boundary:** This document records the proposed expansion and separates existing repository capabilities from future work.

## 1. Executive Position

ONENESS has crossed the boundary between a collection of Cloudflare application starters and a template-generation and validation platform. The current repository already provides a TypeScript/pnpm monorepo, a reusable CLI registry, 16 application templates, Cloudflare Worker and Hono foundations, binding-aware examples, generated-project validation, local Wrangler testing, and GitHub Actions automation. Those capabilities establish a strong foundation, but they do not by themselves constitute production payment processing, regulated financial infrastructure, government certification, sovereign hosting, full enterprise IAM, or a provider-neutral runtime.

The strategic recommendation is therefore to evolve the conceptual model from **“16 Cloudflare application templates”** to **“the ONENESS Application and Infrastructure Pathway Platform.”** The platform should make application classes composable rather than treating every template as an isolated product.

## 2. Target Layered Architecture

The proposed architecture has five layers.

```text
ONENESS PLATFORM
        │
        ├── CONTROL PLANE
        │   CLI / Registry / Policy / Composition
        │
        ├── APPLICATION PLANE
        │   SaaS / AI / Commerce / Procurement / Devices
        │
        ├── SERVICE PLANE
        │   Auth / API / Data / AI / Events / Storage / Jobs
        │
        ├── INFRASTRUCTURE PLANE
        │   Workers / D1 / KV / R2 / Queues / Durable Objects / AI
        │
        └── EXTERNAL WORLD
            Users / Businesses / Devices / Partners / APIs
```

The **control plane** should own template discovery, capability composition, policy validation, dependency resolution, and project generation. The **application plane** should express domain pathways such as enterprise, commerce, procurement, AI, web, mobile, IoT, and digital twins. The **service plane** should provide reusable cross-domain capabilities. The **infrastructure plane** should expose provider-specific adapters behind stable interfaces. The external world remains the boundary for users, organizations, devices, partners, and third-party services.

## 3. Application Pathways

The existing catalog naturally maps into a wider pathway model.

| Pathway | Existing foundation | Proposed expansion |
| --- | --- | --- |
| Consumer | SaaS and administration | Identity, profiles, subscriptions, and wallets. |
| Enterprise | SaaS, API, and administration | Organizations, departments, RBAC, audit, and policy. |
| AI | AI visibility and Workers AI | Agents, RAG, tools, routing, orchestration, and human approval. |
| Commerce | Commerce and LLM discovery | Catalog, orders, inventory, fulfillment, and analytics. |
| Payments | API and SaaS foundation | Payment adapters, invoicing, settlement, and reconciliation. |
| Procurement | `sourcing-workflows` | RFQ/RFP, tenders, supplier lifecycle, contracts, and audit. |
| Web | `website-builder` | Sites, domains, publishing, and analytics. |
| Mobile | API foundation | Mobile backend-for-frontend, notifications, and device integration. |
| IoT | `universal-driver` | Device registry, telemetry, commands, firmware, and certificates. |
| Digital Twin | `universal-driver` | Twin state, simulation, events, alerts, and AI interpretation. |
| Real-time | `durable-chat` and real-time templates | Collaboration, presence, rooms, and event streams. |
| Data | D1, KV, R2, and queues | Pipelines, analytics, exports, retention, and audit. |
| Knowledge | AI and data foundations | Knowledge graphs, semantic search, and governed RAG. |
| Government | Sourcing and API foundations | Delegated authority, tendering, records, compliance, and reporting. |
| Infrastructure | Cloudflare bindings | Energy, utilities, infrastructure assets, and sovereign operations. |
| Security | JWT, validation, and rate limiting | IAM, policy engines, service identities, key rotation, and immutable audit. |
| Research and immersive systems | AI, device, and real-time foundations | Scientific applications, VR/AR backends, and experimental workflows. |

This mapping is a **roadmap classification**, not a claim that every pathway is implemented today.

## 4. Composable Capability Modules

The next architectural step should be capability composition. Instead of creating dozens of independent templates, the platform should provide modules that can be selected by a pathway or project profile.

```text
MASTER
├── identity
├── organisations
├── permissions
├── payments
├── subscriptions
├── commerce
├── procurement
├── ai
├── knowledge
├── messaging
├── notifications
├── storage
├── analytics
├── audit
├── devices
├── digital-twins
├── workflows
├── deployment
└── policy
```

A future `oneness init enterprise` operation could compose identity, organizations, RBAC, audit, API, database, storage, queues, and observability. A future `oneness init marketplace` operation could compose identity, commerce, catalog, payments, orders, suppliers, AI discovery, and analytics.

Each module should eventually declare a machine-readable contract containing its name, version, dependencies, bindings, configuration schema, migrations, routes, policies, tests, and compatibility constraints. The current template registry is the natural control-plane starting point for this evolution.

## 5. Financial and Payment Pathway

The current repository does not establish a production payment system. The correct next layer is a payment abstraction that keeps sensitive payment credentials outside application code.

```text
ONENESS APPLICATION
        │
        ▼
PAYMENT ADAPTER
        │
        ▼
EXTERNAL PSP / BANKING PROVIDER
        │
        ▼
WEBHOOK
        │
        ▼
ONENESS EVENT BUS
        │
        ▼
ORDER / INVOICE / LEDGER STATE
```

The payment pathway should separate cards, bank payments, wallets, ledger operations, settlement, reconciliation, and audit. Provider adapters should expose stable domain interfaces while delegating credential custody and regulated processing to external payment service providers.

## 6. Procurement Pathway

The sourcing template provides a strong starting point for a procurement operating pathway:

```text
Supplier registration
  → Verification
  → Product/service catalog
  → RFQ/RFP
  → Bid submission
  → Evaluation
  → Approval
  → Purchase order
  → Contract
  → Delivery
  → Invoice
  → Payment
  → Reconciliation
  → Audit
```

The implementation priority should be a governed state machine with explicit roles, approval policies, immutable transitions, document storage, event publication, and audit records. Procurement should be an optional pathway rather than a hard-coded requirement for every application.

## 7. Governance and Public-Sector Profile

Government and public-sector behavior should be implemented as a configurable governance profile. Policy should be represented as configuration and validated at the control plane rather than being scattered throughout application code.

A public-sector profile may include identity, organizations, delegated authority, procurement, tendering, contract management, records, audit, retention, and reporting. The same infrastructure should remain usable by an individual, startup, SME, enterprise, institution, contractor, or public-sector organization through policy selection and capability composition.

## 8. Provider-Neutral Runtime Contract

The current runtime is Cloudflare-centric. To support cloud, hybrid, private, edge, and sovereign deployment pathways, applications should depend on ONENESS interfaces wherever practical.

| ONENESS interface | Cloudflare adapter | Self-hosted adapter candidate |
| --- | --- | --- |
| Relational database | D1 | PostgreSQL |
| Key-value state | KV | Redis |
| Object storage | R2 | S3-compatible storage |
| Asynchronous jobs | Queues | NATS or Kafka |
| Real-time coordination | Durable Objects | WebSocket service |
| AI execution | Workers AI | Local or remote AI provider |

This abstraction should be introduced incrementally. The first step is to define interfaces and contract tests; the second is to implement Cloudflare adapters behind those interfaces; the third is to add self-hosted adapters without changing application-level domain code.

## 9. AI Control Plane

The AI pathway should evolve from individual AI-enabled templates into a governed control plane.

```text
Models ─── Routing
   │          │
Agents ─── Tools ─── Knowledge / RAG
   │          │
   └──── Workflows ─── Human approval
```

Agents should not receive unrestricted infrastructure access. The recommended execution chain is:

```text
Agent → Policy → Tool permission → Sandbox → Action → Audit event
```

This establishes a clear boundary between model reasoning, allowed tools, infrastructure access, human approval, and durable audit records.

## 10. Device and Digital-Twin Pathway

`universal-driver` already establishes device registration, telemetry, commands, digital-twin state, and hardware status. The next stage is a stronger device lifecycle model.

```text
Device
├── Identity
├── Certificate
├── Firmware
├── Capabilities
├── Telemetry
├── Commands
└── State
      │
      ▼
Digital twin
├── Current state
├── Historical state
├── Simulation state
├── Alerts
├── Events
└── AI interpretation
```

A shared event model should connect device commands, telemetry, twin state changes, alerts, and audit records. Simulation state should be explicitly separated from real device state.

## 11. Common Event, Data, and Audit Backbone

The platform should standardize the following domain execution sequence:

```text
Command
  → Validation
  → Authorization
  → Transaction
  → Domain event
  → Queue
  → Consumers
  → Audit record
```

This backbone connects application pathways without requiring each template to invent a separate event and audit model. The design should support correlation IDs, idempotency keys, actor identity, tenant identity, policy decisions, resource references, event versioning, and immutable audit retention.

## 12. Security Maturity Path

JWT authentication, Zod validation, and rate limiting are useful foundations but are not a complete enterprise security model. The target security pathway is:

```text
Identity
  → Authentication
  → Authorization
  → Policy engine
  → Resource permission
  → Action
  → Audit
```

Future security modules should cover RBAC, ABAC, organization isolation, tenant isolation, service identities, API keys, OAuth/OIDC adapters, secret management, key rotation, signed events, immutable audit records, security policies, and administrative approval workflows.

## 13. CI/CD Maturity Path

The current GitHub Actions workflow already performs workspace validation, registry verification, generated-project scaffolding, typechecking, builds, and tests for all 16 templates. The recommended maturity sequence is:

```text
Commit
  → Lint
  → Typecheck
  → Unit tests
  → Template integrity
  → Generated-project build
  → Security scan
  → Dependency scan
  → Policy validation
  → Integration tests
  → Cloudflare preview
  → Approval
  → Production deployment
  → Post-deployment verification
```

Security scanning, dependency scanning, policy validation, authenticated Cloudflare preview deployment, approval gates, and post-deployment verification remain future work. They should be added as explicit gates rather than hidden inside application templates.

## 14. Capability Maturity and Gap Analysis

| Status | Demonstrated or planned capabilities |
| --- | --- |
| **Green: demonstrated** | Monorepo, CLI, registry, 16 templates, TypeScript, Hono, Cloudflare bindings, generated-project validation, CI, local Wrangler testing, binding-heavy examples, corrected Durable Object export, and Cloudflare compatibility fixes. |
| **Amber: partially demonstrated** | Production Cloudflare operations, WebSocket runtime behavior, production AI execution, queue delivery, remote R2, production D1, dedicated tests for every template, authenticated deployment, and enterprise governance. |
| **Red: future pathways** | Production payments, banking infrastructure, regulated financial services, blockchain infrastructure, government certification, sovereign/self-hosted runtime, full enterprise IAM, multi-cloud abstraction, full mobile applications, production marketplace, and ERP functionality. |

This distinction is essential. The platform has a strong scaffold and validation system, but the templates remain starters rather than fully provisioned production services.

## 15. Recommended Target Repository

A future expanded repository could evolve toward the following structure:

```text
oneness/
├── apps/
│   ├── control-center
│   ├── admin
│   ├── marketplace
│   ├── procurement
│   ├── device-console
│   └── developer-portal
├── packages/
│   ├── core
│   ├── cli
│   ├── shared
│   ├── identity
│   ├── organisations
│   ├── authorization
│   ├── payments
│   ├── commerce
│   ├── procurement
│   ├── ai
│   ├── agents
│   ├── knowledge
│   ├── workflows
│   ├── messaging
│   ├── notifications
│   ├── devices
│   ├── digital-twins
│   ├── analytics
│   ├── audit
│   ├── compliance
│   └── integrations
├── adapters/
│   ├── cloudflare
│   ├── postgres
│   ├── redis
│   ├── s3
│   ├── payments
│   ├── blockchain
│   └── ai
├── templates/
│   ├── consumer
│   ├── enterprise
│   ├── saas
│   ├── marketplace
│   ├── procurement
│   ├── ai
│   ├── device
│   ├── digital-twin
│   └── government
├── policies/
├── schemas/
├── migrations/
├── infrastructure/
├── security/
├── tests/
└── docs/
```

This structure is a target architecture, not an instruction to create empty production packages prematurely. The recommended sequence is to introduce one capability module and one adapter contract at a time, with tests and policy definitions included from the beginning.

## 16. Strategic Result

The platform’s long-term value is not the number of templates. It is the ability for one project to grow through progressively composed capabilities:

```text
Person
  → Account
  → Business
  → Team
  → SaaS
  → Commerce
  → Procurement
  → AI
  → Devices
  → Digital twin
  → Enterprise
  → Government / institution
  → Hybrid / sovereign deployment
```

The strategic next phase is therefore **ONENESS Platform Expansion**: one core, many pathways, composable capabilities, provider-neutral adapters, policy-controlled automation, and verified deployment gates.

## 17. Implementation Boundaries

The pasted proposal is an architecture and roadmap update rather than a source-code specification. It does not declare concrete filenames, APIs, migrations, provider credentials, or production deployment targets. Accordingly, the repository update should preserve a clear boundary:

> The current implementation records and operationalizes the proposed architecture as a documented roadmap. It does not claim to have implemented payment processing, regulated banking, government certification, blockchain infrastructure, sovereign hosting, or complete enterprise IAM.

Actual implementation of those pathways should begin with explicit module contracts, schemas, threat models, provider adapters, integration tests, and authenticated preview environments.

## References

[1]: ../docs/TECHNICAL_OVERVIEW.md "Existing ONENESS technical overview"

[2]: ../packages/cli/src/index.ts "Current CLI registry and scaffolding implementation"

[3]: ../.github/workflows/ci.yml "Current GitHub Actions validation workflow"
