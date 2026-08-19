# Sovereign SaaS integration

ONENESS now tracks Sovereign SaaS as an external public project through `config/external-projects.json`. The source repository is [onegayunicorn/sovereign-saas](https://github.com/onegayunicorn/sovereign-saas).

The project record is intentionally metadata-only. It records that the project was extracted, repaired, built, smoke-tested, and published publicly, while keeping activation and production launch explicitly disabled until deployment prerequisites are supplied.

| Field | State |
|---|---|
| Build | Passed according to the supplied project report |
| Smoke test | Passed according to the supplied project report |
| Activation | Not activated |
| Deployment | Published artifact/repository; launch not executed |
| Target | Cloudflare configuration present in the external repository |
| Domain | `identity-forge.sovereign.ai` appears in the external configuration |
| Required before launch | Target confirmation, production credentials, environment secrets, domain/DNS confirmation |

The ONENESS platform does not clone the Sovereign SaaS source into the monorepo, execute its deployment scripts, or assume control of its Cloudflare account. This record is used for discovery and governance surfaces such as the Control Center.

The external project must be treated as an independently owned deployable application. Before adding runtime composition, use a server-side read-only adapter to obtain immutable commit, build, artifact, deployment, and health metadata. Do not expose API keys, database credentials, Redis credentials, webhook secrets, Cloudflare tokens, or private keys to the Control Center frontend.

## Activation contract

Activation requires an explicitly named environment and target, approved production credentials, validated environment secrets, domain ownership and DNS confirmation, a health-check plan, rollback instructions, and an authorized user action. The existence of a public repository or published build is not authorization to activate or launch the service.

No activation or production launch action was performed as part of this integration.
