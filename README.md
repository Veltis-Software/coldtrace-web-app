# ColdTrace Web Application

## Application Information

ColdTrace is an Angular web application for cold-chain monitoring operations. It helps food businesses review refrigerated assets, IoT devices, alerts, maintenance work, access control, subscriptions and traceability reports from a single dashboard experience.

## Description

The application consumes the ColdTrace API Gateway, which routes each request to the microservice that owns it: Identity, Asset, Monitoring, Alert, Report, Subscription, Maintenance and AI Assistance.

The project follows bounded contexts, standalone Angular components, route-level lazy loading, simple domain entities, infrastructure assemblers and environment-based API endpoints.

## Scope

- Identity and access management: organization sign-up, sign in, password recovery, users, roles and permissions.
- Asset management: locations, cold rooms, transport units, IoT devices, gateways, source configuration and asset settings.
- Operational monitoring: dashboard KPIs, current readings, asset states, connectivity, charts and maintenance widgets.
- Alerts and incidents: real-time notifications, assignment with undo, corrective actions, closure, history and CSV export.
- Reports: asynchronous traceability reports and AI-assisted interpretation and resolution plans.
- Subscriptions: plans, limits and billing.

## Project Structure

```txt
src/app/
  identity-access/       Account, users, roles, permissions
  asset-management/      Assets, locations, devices, gateways, settings
  monitoring/            Dashboard, readings, asset states
  alerts/                Incidents, notifications, corrective actions
  reports/               Traceability reports and history
  billing/               Plans, subscription and billing
  maintenance-management/ Preventive maintenance and service requests
  shared/                Layout, shell, language switcher, infrastructure base classes
docs/
  user-stories.md        User stories and acceptance criteria
  class-diagram.puml     PlantUML class diagram
  frontend-architecture.md
  local-api.md
deployment/              Nginx template and Cloud Run proxy
```

Each bounded context keeps the same internal structure:

```txt
application/             Signal-based state store
domain/model/            Entities, enums, and domain types
infrastructure/          API services, endpoints, resources, assemblers
presentation/            Routes, views, and presentation components
```

## Development

Use Node 22. Start the services with `coldtrace-infrastructure`, then:

```bash
npm ci
npm start
```

Open `http://localhost:4200`. In development the application calls the gateway configured in `src/environments/environment.development.ts`.

## Build and Test

```bash
npm test -- --watch=false
npm run build
```

`package.json` overrides pin Vite 7.3.7 and Undici 7.30.1 to patched releases used by development and test tooling. Validate changes to these pins with `npm audit`, the tests and the build.

## Deployment

Production builds call `/api/v1` on the same origin. The Docker image serves the application with Nginx and proxies API requests to `API_UPSTREAM`. In Google Cloud Run the service `coldtrace-web` is the only public service; the `deployment/cloud-run-gateway-proxy.mjs` sidecar forwards API requests to the private gateway with a Cloud Run identity token.

## Documentation

- [User Stories](docs/user-stories.md)
- [Class Diagram](docs/class-diagram.puml)
- [Frontend Architecture](docs/frontend-architecture.md)
- [Local API](docs/local-api.md)
