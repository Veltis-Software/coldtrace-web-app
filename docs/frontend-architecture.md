# ColdTrace Frontend Architecture

This document describes the current frontend architecture used by `coldtrace-frontend`. It follows the same lightweight documentation style used in the class reference projects.

---

## Architectural Style

The application is organized by bounded context. Each context separates domain models, API infrastructure, application state, and presentation views.

```txt
bounded-context/
  application/
  domain/model/
  infrastructure/
  presentation/
```

Angular standalone components are loaded through route-level lazy loading. Shared layout elements live under `shared/presentation/components`.

---

## Bounded Contexts

### Identity Access

Folder: `src/app/identity-access`

Purpose:

- Account creation.
- Sign in.
- Password recovery and reset.
- User list.
- Role and permission management.
- Current organization and role context.

Main store:

- `IdentityAccessStore`

Main routes:

- `/identity-access/dashboard`
- `/identity-access/sign-in`
- `/identity-access/sign-up`
- `/identity-access/password-recovery`
- `/identity-access/reset-password`
- `/identity-access/roles-permissions/users/new`
- `/identity-access/roles-permissions`
- `/identity-access/roles-permissions/permissions`

The dashboard route is kept in this context as an entry point after sign in, but it loads the operational dashboard component from the monitoring bounded context.

---

### Asset Management

Folder: `src/app/asset-management`

Purpose:

- Cold rooms and refrigerated transport units.
- IoT devices.
- Gateways.
- Calibration and connectivity state.
- Safety settings used by monitoring and reports.

Main store:

- `AssetManagementStore`

Main routes:

- `/asset-management/assets`
- `/asset-management/safety-ranges`
- `/asset-management/operational-parameters`

Asset management exposes settings used by both the monitoring dashboard and the reports module. Temperature and humidity limits are read from the backend API instead of hard-coded component values.

---

### Monitoring

Folder: `src/app/monitoring`

Purpose:

- Asset monitoring dashboard.
- Operational dashboard.
- KPI cards.
- Temperature chart.
- Storage distribution.
- Recent alerts.
- Maintenance list.
- Offline reading sync state.

Main store:

- `MonitoringStore`

Main routes:

- `/monitoring/assets`
- `/monitoring/operational`
- `/identity-access/dashboard`

The monitoring views read asset, device, gateway, settings, and sensor reading data from the backend to present operational status. Demo telemetry is requested through the backend-owned generation endpoint, so generated readings are persisted by the API instead of being fabricated in the UI.

---

### Alerts

Folder: `src/app/alerts`

Purpose:

- Thermal incidents generated from out-of-range readings.
- Critical alert recognition.
- Incident closure with corrective action and evidence.
- Alert notifications.
- Escalation tracking for unattended incidents.

Main store:

- `AlertsStore`

Main routes:

- `/alerts/incidents`
- `/alerts/notifications`

The alerts context depends on identity data for user and permission information, and on monitoring data for current thermal conditions.

---

### Reports

Folder: `src/app/reports`

Purpose:

- Daily thermal log.
- Operational history.
- Sanitary compliance export.
- Monthly report export.
- Compliance findings.
- Audit evidence checklist.

Main store:

- `ReportsStore`

Main routes:

- `/reports/daily-log`
- `/reports/history`
- `/reports/compliance`
- `/reports/monthly`
- `/reports/findings`
- `/reports/audit-evidence`

Reports use backend operational data and persist report references through the reports endpoint. CSV export names use the current organization name and selected period.

---

### Maintenance Management

Folder: `src/app/maintenance-management`

Purpose:

- Preventive maintenance scheduling.
- Technical service request tracking.
- Service state review for operations follow-up.

Main store:

- `MaintenanceManagementStore`

Main routes:

- `/maintenance/preventive`
- `/maintenance/technical-service`

Maintenance data is consumed through organization-scoped backend endpoints and is linked to organization and asset records.

---

## Shared Layer

Folder: `src/app/shared`

Purpose:

- Dashboard shell.
- Public layout.
- Language switcher.
- Page not found view.
- Base API endpoint, assembler, response, and entity contracts.

The shared infrastructure keeps backend integration consistent across contexts. The dashboard shell owns the sidebar navigation, dashboard language switcher, organization label, access shortcuts, reports shortcuts, notifications entry, and current user controls.

---

## Routing

Root route file: `src/app/app.routes.ts`

```txt
/identity-access
/asset-management
/monitoring
/reports
/alerts
/maintenance
```

Each route loads its feature routes lazily. This keeps the root router simple and close to the professor reference style.

---

## State Management

The application uses Angular signals in lightweight stores instead of a global state library.

Examples:

- `IdentityAccessStore` keeps users, roles, organizations, and current user context.
- `AssetManagementStore` keeps assets, devices, gateways, and settings.
- `MonitoringStore` keeps sensor readings and offline sync state.
- `ReportsStore` builds report view models from monitoring and asset data.
- `AlertsStore` keeps incidents, notifications, recognition, closure, and escalation state.
- `MaintenanceManagementStore` keeps preventive schedules and technical service requests.

---

## Internationalization

The application uses `@ngx-translate/core`.

Translation files:

```txt
public/i18n/en.json
public/i18n/es.json
```

Product UI text is kept in English by default, with Spanish support where translation keys exist.

---

## API Integration

Development and production builds call the deployed Spring Boot backend directly.

The frontend reads endpoint paths from:

```txt
src/environments/environment.development.ts
src/environments/environment.ts
```

The hosted backend URL is:

```txt
https://coldtrace-platform-dtbzbm7bta-uc.a.run.app
```

Authentication, authorization enforcement, email delivery, and password recovery remain represented through frontend state until those backend flows are part of the project scope.
