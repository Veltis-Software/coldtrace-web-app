# ColdTrace Frontend

## Application Information

ColdTrace is an Angular frontend application for cold-chain monitoring operations. It helps food businesses review refrigerated assets, IoT devices, alerts, maintenance work, access control, and compliance reports from a single dashboard experience.

## Description

ColdTrace is the frontend web application for ICEQ, a platform focused on cold-chain monitoring for food businesses. The current implementation is an Angular application that consumes the ColdTrace Spring Boot backend during local development and the deployed backend in production builds.

The project follows the course style used in the reference applications: bounded contexts, standalone Angular components, route-level lazy loading, simple domain entities, infrastructure assemblers, and environment-based API endpoints.

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

During local development, Angular calls the local Spring Boot backend:

```txt
http://localhost:8080
```

Production builds call the deployed backend:

```txt
https://coldtrace-platform-dtbzbm7bta-uc.a.run.app
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
- Real JWT authentication, real email delivery, and production backend authorization are outside the current frontend scope.
