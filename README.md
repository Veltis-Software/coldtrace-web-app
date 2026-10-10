# ColdTrace Frontend

## Application Information

ColdTrace is an Angular frontend application for cold-chain monitoring operations. It helps food businesses review refrigerated assets, IoT devices, alerts, maintenance work, access control, and compliance reports from a single dashboard experience.

## Description

ColdTrace is the frontend web application maintained in Veltis-Software for cold-chain monitoring. It consumes the API Gateway, which routes requests to the extracted services and the remaining brownfield capabilities.

The project follows the course style used in the reference applications: bounded contexts, standalone Angular components, route-level lazy loading, simple domain entities, infrastructure assemblers, and environment-based API endpoints.

## Veltis migration and Sprint 1

The active repository is Veltis-Software/coldtrace-web-app. Current asset states, incident detail, notification deep links, assignment with ten-second undo, corrective actions and asynchronous traceability reports use the extracted services through the API Gateway. IAM and assets still use the temporary brownfield backend.

Development requests use http://127.0.0.1:18080. Production builds use same-origin API requests; configure API_UPSTREAM on the web container to point to the gateway. Configure new OAuth clients before enabling social sign-in. The previous organization deployment and Vercel preview workflow are no longer used.

Use Node 22, npm ci, npm run test -- --watch=false and npm run build. Dockerfile builds the web application independently; cloud deployment remains pending the academic project.

## Current Scope

- Identity and access management: account creation, sign in, password recovery, users, roles, and permissions.
- Asset management: locations, cold rooms, transport units, IoT devices, gateways, calibration, connectivity, and asset settings.
- Operational monitoring: dashboard KPIs, current readings, alerts, connectivity state, offline sync, charts, and maintenance widgets.
- Reports and audit support: daily log, operational history, sanitary compliance CSV, monthly report CSV, findings, and audit evidence.
- Local API consumption through the ColdTrace Spring Boot backend.

## Project Structure

```txt
src/app/
  identity-access/       Account, users, roles, permissions
  asset-management/      Assets, locations, devices, gateways, calibration
  monitoring/            Dashboard, readings, alerts, offline sync
  reports/               Daily log, history, compliance, audit evidence
  shared/                Layout, shell, language switcher, infrastructure base classes
docs/
  user-stories.md        User stories and acceptance criteria
  class-diagram.puml     PlantUML class diagram
  frontend-architecture.md
  local-api.md
```

Each bounded context keeps the same internal structure:

```txt
application/             Signal-based state store
domain/model/            Entities, enums, and domain types
infrastructure/          API services, endpoints, resources, assemblers
presentation/            Routes, views, and presentation components
```

## Development

Install dependencies:

```bash
npm install
```

Run the Spring Boot backend:

```bash
cd ../coldtrace-platform
./mvnw spring-boot:run
```

Run the Angular application:

```bash
npm start
```

Open:

```txt
http://localhost:4200
```

During local development, Angular calls the API Gateway:

```txt
http://127.0.0.1:18080
```

Production builds call the same-origin gateway proxy configured through API_UPSTREAM:

```txt
/api/v1
```

## Build and Test

```bash
npm run build
npm test
```

## Documentation

- [User Stories](docs/user-stories.md)
- [Class Diagram](docs/class-diagram.puml)
- [Frontend Architecture](docs/frontend-architecture.md)
- [Local API](docs/local-api.md)

## Notes

- The application keeps the product-facing UI in English.
- The frontend now targets the ColdTrace Spring Boot backend. The `server/` folder is retained only as legacy mock data from the previous local API phase.
- JWT authentication and server-side organization authorization are exercised by the Sprint 1 flow. Notifications use the in-app channel; email delivery and Google Cloud deployment are pending.
