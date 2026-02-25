# Gitea Mirror Documentation

This folder contains engineering and operations references for the open-source Gitea Mirror project. Each guide focuses on the parts of the system that still require bespoke explanation beyond the in-app help and the main `README.md`.

## Available Guides

### Core workflow
- **[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)** – Set up a local environment, run scripts, and understand the repo layout (app + marketing site).
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** – Complete reference for every configuration flag supported by the app and Docker images.

### Reliability & recovery
- **[GRACEFUL_SHUTDOWN.md](./GRACEFUL_SHUTDOWN.md)** – How signal handling, shutdown coordination, and job persistence work in v3.
- **[RECOVERY_IMPROVEMENTS.md](./RECOVERY_IMPROVEMENTS.md)** – Deep dive into the startup recovery workflow and supporting scripts.

### Authentication
- **[SSO-OIDC-SETUP.md](./SSO-OIDC-SETUP.md)** – Configure OIDC/SSO providers through the admin UI.
- **[SSO_TESTING.md](./SSO_TESTING.md)** – Recipes for local and staging SSO testing (Google, Keycloak, mock providers).

If you are looking for customer-facing playbooks, see the MDX use cases under `www/src/pages/use-cases/`.

## Quick start for local development

```bash
git clone https://github.com/hermesthecat/gitea-mirror.git
cd gitea-mirror
bun run setup           # installs deps and seeds the SQLite DB
bun run dev             # starts the Astro/Bun app on http://localhost:4321
```

The first user you create locally becomes the administrator. All other configuration—GitHub owners, Gitea targets, scheduling, cleanup—is done through the **Configuration** screen in the UI.

## Contributing & support

- 🎯 Contribution guide: [../CONTRIBUTING.md](../CONTRIBUTING.md)
- 📘 Code of conduct: [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
- 🐞 Issues & feature requests: <https://github.com/hermesthecat/gitea-mirror/issues>
- 💬 Discussions: <https://github.com/hermesthecat/gitea-mirror/discussions>

Security disclosures should follow the process in [../SECURITY.md](../SECURITY.md).
