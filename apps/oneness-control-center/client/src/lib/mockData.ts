/* Mineral Signal mock adapter: deterministic control-plane records with explicit mock provenance. */
export type MockStatus = "ready" | "resolved" | "validated" | "pending" | "future" | "draft" | "blocked";

export interface MockPathway {
  id: string;
  name: string;
  status: "foundation" | "future";
  capabilityCount: number;
  foundations: string[];
  capabilities: string[];
}

export interface MockPlugin {
  id: string;
  name: string;
  version: string;
  status: "validated" | "pending";
  capabilityCount: number;
  capabilities: string[];
  dependencies: string[];
}

export interface MockActivity {
  id: string;
  title: string;
  meta: string;
  status: MockStatus;
}

export interface MockLifecycle {
  generated: number;
  validated: number;
  preview: number;
  approved: number;
  production: number;
}

export interface MockControlSnapshot {
  mode: "mock";
  refreshedAt: string;
  health: number;
  applications: number;
  capabilities: number;
  pathways: MockPathway[];
  plugins: MockPlugin[];
  lifecycle: MockLifecycle;
  activities: MockActivity[];
  unresolvedCapabilities: number;
  futureCapabilities: number;
}

const pathways: MockPathway[] = [
  { id: "enterprise", name: "Enterprise", status: "foundation", capabilityCount: 8, foundations: ["saas-admin", "master"], capabilities: ["identity", "organisations", "authorization", "audit"] },
  { id: "procurement", name: "Procurement", status: "foundation", capabilityCount: 5, foundations: ["sourcing-workflows"], capabilities: ["rfq", "supplier-lifecycle", "contracts", "audit"] },
  { id: "digital-twin", name: "Digital Twin", status: "foundation", capabilityCount: 5, foundations: ["universal-driver"], capabilities: ["twin-state", "simulation", "events", "alerts"] },
  { id: "sovereign-runtime", name: "Sovereign Runtime", status: "future", capabilityCount: 6, foundations: ["master"], capabilities: ["provider-neutral-contracts", "postgres", "redis", "s3"] }
];

const plugins: MockPlugin[] = [
  { id: "acme-risk", name: "Acme Risk", version: "1.0.0", status: "validated", capabilityCount: 8, capabilities: ["risk-scoring", "fraud-analysis", "risk-report"], dependencies: ["identity"] },
  { id: "ai-analytics", name: "AI Analytics", version: "2.1.0", status: "validated", capabilityCount: 5, capabilities: ["model-evaluation", "semantic-metrics", "agent-observability"], dependencies: ["ai", "audit"] },
  { id: "commerce-bridge", name: "Commerce Bridge", version: "0.8.2", status: "pending", capabilityCount: 3, capabilities: ["catalog-sync", "fulfilment", "tax-routing"], dependencies: ["commerce", "storage"] }
];

export function createMockSnapshot(): MockControlSnapshot {
  return {
    mode: "mock",
    refreshedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    health: 98,
    applications: 12,
    capabilities: 47,
    pathways,
    plugins,
    lifecycle: { generated: 12, validated: 9, preview: 3, approved: 0, production: 0 },
    activities: [
      { id: "activity-1", title: "Enterprise App", meta: "materialized · 2m ago", status: "ready" },
      { id: "activity-2", title: "Procurement App", meta: "composed · 14m ago", status: "resolved" },
      { id: "activity-3", title: "Acme Risk", meta: "plugin loaded · 31m ago", status: "validated" },
      { id: "activity-4", title: "AI Capability", meta: "awaiting dependency · 1h ago", status: "pending" }
    ],
    unresolvedCapabilities: 0,
    futureCapabilities: 18
  };
}

export const MOCK_SNAPSHOT = createMockSnapshot();

export type MockScenario = "live" | "latency" | "empty" | "error";
export type MockRequestState = "idle" | "loading" | "success" | "empty" | "error";

export interface MockRequestResult {
  state: MockRequestState;
  data?: MockControlSnapshot;
  message?: string;
}

export function requestMockSnapshot(scenario: MockScenario, delay = scenario === "latency" ? 1800 : 650): Promise<MockRequestResult> {
  return new Promise(resolve => {
    window.setTimeout(() => {
      if (scenario === "error") {
        resolve({ state: "error", message: "The simulated control API could not be reached." });
        return;
      }
      if (scenario === "empty") {
        const snapshot = createMockSnapshot();
        resolve({ state: "empty", data: { ...snapshot, applications: 0, capabilities: 0, pathways: [], plugins: [], activities: [], futureCapabilities: 0, lifecycle: { generated: 0, validated: 0, preview: 0, approved: 0, production: 0 } } });
        return;
      }
      resolve({ state: "success", data: createMockSnapshot() });
    }, delay);
  });
}

export type IntegrationLifecycle = "draft" | "configured" | "validated" | "connected" | "active" | "paused" | "degraded" | "failed" | "disabled";
export type IntegrationHealth = "healthy" | "degraded" | "failed";

export interface CredentialReference {
  id: string;
  provider: "vault" | "oauth" | "secret-manager";
  label: string;
  secretMaterialVisible: false;
  rotationDue: string;
}

export interface Environment {
  id: string;
  name: "Development" | "Staging" | "Production";
  region: string;
  status: "active" | "standby";
}

export interface Business {
  id: string;
  name: string;
  industry: string;
  compliance: "verified" | "review" | "pending";
  environments: Environment[];
  integrationIds: string[];
  capabilities: string[];
  health: IntegrationHealth;
  recentActivity: string;
}

export interface Connector {
  id: string;
  provider: string;
  category: "crm" | "erp" | "payments" | "identity" | "api" | "webhook";
  authMethod: "oauth2" | "api-key" | "oidc" | "hmac";
  capabilities: string[];
}

export interface Integration {
  id: string;
  businessId: string;
  environmentId: string;
  connector: Connector;
  lifecycle: IntegrationLifecycle;
  health: IntegrationHealth;
  lastSuccessfulSync: string;
  errorClass?: string;
  credential: CredentialReference;
}

export interface Pipeline {
  id: string;
  businessId: string;
  integrationId: string;
  name: string;
  lifecycle: IntegrationLifecycle;
  health: IntegrationHealth;
  stages: ["Trigger", "Input", "Transform", "Validate", "Route", "Execute", "Output"];
  throughput: string;
  lastExecution: string;
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  businessId: string;
  timestamp: string;
  duration: string;
  status: "succeeded" | "running" | "retrying" | "failed";
  recordsProcessed: number;
  retryCount: number;
  error?: string;
  provenance: string[];
}

export const MOCK_BUSINESSES: Business[] = [
  { id: "northstar-health", name: "Northstar Health", industry: "Healthcare", compliance: "verified", environments: [{ id: "northstar-prod", name: "Production", region: "eu-west-1", status: "active" }, { id: "northstar-stage", name: "Staging", region: "eu-west-1", status: "standby" }], integrationIds: ["northstar-salesforce", "northstar-okta"], capabilities: ["identity", "crm", "audit"], health: "healthy", recentActivity: "Pipeline completed · 4m ago" },
  { id: "atlas-supply", name: "Atlas Supply Co.", industry: "Logistics", compliance: "review", environments: [{ id: "atlas-prod", name: "Production", region: "us-east-2", status: "active" }], integrationIds: ["atlas-erp", "atlas-webhook"], capabilities: ["procurement", "inventory", "events"], health: "degraded", recentActivity: "ERP latency elevated · 9m ago" },
  { id: "lumen-finance", name: "Lumen Finance", industry: "Financial services", compliance: "verified", environments: [{ id: "lumen-prod", name: "Production", region: "ap-southeast-1", status: "active" }], integrationIds: ["lumen-stripe"], capabilities: ["payments", "reconciliation", "audit"], health: "healthy", recentActivity: "Credential rotation scheduled · 2h ago" }
];

export const MOCK_INTEGRATIONS: Integration[] = [
  { id: "northstar-salesforce", businessId: "northstar-health", environmentId: "northstar-prod", connector: { id: "salesforce", provider: "Salesforce", category: "crm", authMethod: "oauth2", capabilities: ["customer-sync", "account-events"] }, lifecycle: "active", health: "healthy", lastSuccessfulSync: "4m ago", credential: { id: "cred-northstar-sf", provider: "vault", label: "salesforce-prod-oauth", secretMaterialVisible: false, rotationDue: "31 days" } },
  { id: "northstar-okta", businessId: "northstar-health", environmentId: "northstar-prod", connector: { id: "okta", provider: "Okta", category: "identity", authMethod: "oidc", capabilities: ["identity", "groups"] }, lifecycle: "connected", health: "healthy", lastSuccessfulSync: "11m ago", credential: { id: "cred-northstar-okta", provider: "secret-manager", label: "okta-prod-oidc", secretMaterialVisible: false, rotationDue: "18 days" } },
  { id: "atlas-erp", businessId: "atlas-supply", environmentId: "atlas-prod", connector: { id: "sap", provider: "SAP S/4HANA", category: "erp", authMethod: "api-key", capabilities: ["purchase-orders", "inventory"] }, lifecycle: "degraded", health: "degraded", lastSuccessfulSync: "9m ago", errorClass: "UPSTREAM_TIMEOUT", credential: { id: "cred-atlas-sap", provider: "vault", label: "sap-production-key", secretMaterialVisible: false, rotationDue: "7 days" } },
  { id: "atlas-webhook", businessId: "atlas-supply", environmentId: "atlas-prod", connector: { id: "shipment-hook", provider: "Shipment Events", category: "webhook", authMethod: "hmac", capabilities: ["delivery-events", "signature-verification"] }, lifecycle: "active", health: "healthy", lastSuccessfulSync: "2m ago", credential: { id: "cred-atlas-hook", provider: "vault", label: "shipment-webhook-hmac", secretMaterialVisible: false, rotationDue: "90 days" } },
  { id: "lumen-stripe", businessId: "lumen-finance", environmentId: "lumen-prod", connector: { id: "stripe", provider: "Stripe", category: "payments", authMethod: "api-key", capabilities: ["payments", "refunds", "payouts"] }, lifecycle: "active", health: "healthy", lastSuccessfulSync: "1m ago", credential: { id: "cred-lumen-stripe", provider: "vault", label: "stripe-live-key", secretMaterialVisible: false, rotationDue: "42 days" } }
];

export const MOCK_PIPELINES: Pipeline[] = [
  { id: "northstar-customer-sync", businessId: "northstar-health", integrationId: "northstar-salesforce", name: "Customer sync", lifecycle: "active", health: "healthy", stages: ["Trigger", "Input", "Transform", "Validate", "Route", "Execute", "Output"], throughput: "1.8k records / hr", lastExecution: "4m ago" },
  { id: "atlas-purchase-orders", businessId: "atlas-supply", integrationId: "atlas-erp", name: "Purchase-order routing", lifecycle: "degraded", health: "degraded", stages: ["Trigger", "Input", "Transform", "Validate", "Route", "Execute", "Output"], throughput: "420 records / hr", lastExecution: "9m ago" },
  { id: "lumen-payment-events", businessId: "lumen-finance", integrationId: "lumen-stripe", name: "Payment event ledger", lifecycle: "active", health: "healthy", stages: ["Trigger", "Input", "Transform", "Validate", "Route", "Execute", "Output"], throughput: "620 events / hr", lastExecution: "1m ago" }
];

export const MOCK_EXECUTIONS: PipelineExecution[] = [
  { id: "exec_01HTNS", pipelineId: "northstar-customer-sync", businessId: "northstar-health", timestamp: "2 minutes ago", duration: "18.4s", status: "succeeded", recordsProcessed: 482, retryCount: 0, provenance: ["northstar-health", "salesforce", "customer-sync"] },
  { id: "exec_01HTNR", pipelineId: "atlas-purchase-orders", businessId: "atlas-supply", timestamp: "9 minutes ago", duration: "42.8s", status: "retrying", recordsProcessed: 91, retryCount: 2, error: "UPSTREAM_TIMEOUT", provenance: ["atlas-supply", "sap", "purchase-orders"] },
  { id: "exec_01HTNQ", pipelineId: "lumen-payment-events", businessId: "lumen-finance", timestamp: "12 minutes ago", duration: "6.1s", status: "succeeded", recordsProcessed: 76, retryCount: 0, provenance: ["lumen-finance", "stripe", "payment-events"] },
  { id: "exec_01HTNP", pipelineId: "northstar-customer-sync", businessId: "northstar-health", timestamp: "18 minutes ago", duration: "—", status: "running", recordsProcessed: 120, retryCount: 0, provenance: ["northstar-health", "salesforce", "customer-sync"] }
];
