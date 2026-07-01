# ColdTrace API Integration

This document explains how the current frontend consumes the ColdTrace Spring Boot backend for development and demonstrations.

---

## API Provider

The frontend reads API paths from:

```txt
src/environments/environment.development.ts
src/environments/environment.ts
```

Development and production builds point to the deployed backend:

```txt
https://coldtrace-platform-dtbzbm7bta-uc.a.run.app
```

---

## Run Locally

Start the Angular application:

```bash
npm start
```

Open:

```txt
http://localhost:4200
```

---

## Main Endpoint Groups

The frontend consumes these backend endpoint groups:

```txt
/organization-sign-ups
/organizations
/roles
/organizations/{organizationId}/users
/organizations/{organizationId}/locations
/organizations/{organizationId}/assets
/organizations/{organizationId}/iot-devices
/organizations/{organizationId}/gateways
/organizations/{organizationId}/asset-settings
/organizations/{organizationId}/sensor-readings
/organizations/{organizationId}/reports
/organizations/{organizationId}/incidents
/organizations/{organizationId}/notifications
/organizations/{organizationId}/maintenance-schedules
/organizations/{organizationId}/technical-service-requests
```

Most operational endpoints are scoped by `organizationId`, keeping dashboard, access, reports, alerts, and maintenance views aligned with the active organization.

---

## Frontend Integration Pattern

Each bounded context has infrastructure classes that wrap endpoint access.

Example pattern:

```txt
domain entity <-> assembler <-> endpoint/api <-> Spring Boot resource
```

The presentation layer works with domain entities. Assemblers and endpoint classes translate those entities to the backend request and response contracts.

The shared `BaseApiEndpoint` handles common CRUD operations when the backend exposes standard methods. Context-specific endpoints override or add methods for action endpoints such as incident acknowledgements, incident resolutions, telemetry demo generation, role assignment, and maintenance status updates.

---

## Current Limitations

- Real JWT authentication and real email delivery are outside the current frontend scope.
- Sign in, password recovery, and some permission behavior still use frontend state until the backend exposes those flows.
- Backend demo telemetry generation is requested from the frontend through `/sensor-readings/demo-generations`.
- Incident notifications are read from the backend as derived read models; the frontend does not persist notification creation directly.
- Delete operations for assets, devices, gateways, and settings are not exposed in the UI because the current backend exposes create/update/read endpoints but not delete endpoints for those resources.
- The `server/` folder remains in the repository only as legacy mock data from the earlier frontend phase.
