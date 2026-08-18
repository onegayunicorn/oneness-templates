# ONENESS Integration Registry Frontend

The Control Center now includes a typed frontend registry boundary for business integrations. This milestone treats the existing control-plane snapshot as the UI contract and adds business, environment, integration, connector, pipeline, execution, event, capability, and credential-reference entities without exposing secret material.

## Connection model

The frontend represents the business connection chain as:

> Business → Environment → Integration → Pipeline → Connector → Capability → Event

A business can own multiple environments and integrations. Each integration points to a common connector shape with provider, category, authentication method, and exposed capabilities. The UI surfaces lifecycle and health independently so an active integration can still report degraded connectivity or elevated latency.

## Views

| Route | Purpose |
|---|---|
| `/businesses` | Organisation directory with compliance, environments, integrations, capabilities, health, and recent activity. Business rows open a detail boundary. |
| `/integrations` | Connection catalogue with provider, connector category, authentication method, lifecycle, health, sync time, and credential reference metadata. |
| `/pipelines` | Pipeline registry with throughput, last execution, lifecycle, and health. The business detail boundary shows a staged Trigger → Input → Transform → Validate → Route → Execute → Output topology. |
| `/executions` | Execution telemetry with execution ID, duration, status, records processed, retry count, and provenance chain. |

## Security boundary

The dashboard intentionally receives `CredentialReference` records rather than secrets. The mock contract includes provider, label, rotation window, and an explicit `secretMaterialVisible: false` invariant. Production adapters should keep OAuth tokens, API keys, webhook secrets, and other connection material inside a secret-management boundary.

Recommended runtime controls include tenant isolation, least-privilege scopes, credential rotation, webhook signature verification, idempotency, replay protection, rate limiting, circuit breakers, retry policies, and dead-letter handling. These controls are runtime responsibilities, not simulated by the static frontend.

## Connector contract

The next backend-facing adapter can conform to the following conceptual interface:

```ts
interface Connector {
  authenticate(): Promise<void>;
  healthCheck(): Promise<"healthy" | "degraded" | "failed">>;
  discoverCapabilities(): Promise<string[]>;
  receive(input: unknown): Promise<unknown>;
  transform(input: unknown): Promise<unknown>;
  validate(input: unknown): Promise<unknown>;
  execute(input: unknown): Promise<unknown>;
  emit(event: unknown): Promise<void>;
  disconnect(): Promise<void>;
}
```

The frontend does not invoke this interface yet. It renders the metadata and state taxonomy needed to replace the mock adapter incrementally with a control API.
