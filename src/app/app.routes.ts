import { Routes } from '@angular/router';
import { authenticatedCanMatch } from './shared/infrastructure/auth.guard';

const identityAccessRoutes = () =>
  import('./identity-access/presentation/identity-access.routes').then(
    (m) => m.identityAccessRoutes,
  );
const assetManagementRoutes = () =>
  import('./asset-management/presentation/asset-management.routes').then(
    (m) => m.assetManagementRoutes,
  );
const monitoringRoutes = () =>
  import('./monitoring/presentation/monitoring.routes').then((m) => m.monitoringRoutes);
const reportsRoutes = () =>
  import('./reports/presentation/reports.routes').then((m) => m.reportsRoutes);
const alertsRoutes = () =>
  import('./alerts/presentation/alerts.routes').then((m) => m.alertsRoutes);
const maintenanceManagementRoutes = () =>
  import('./maintenance-management/presentation/maintenance-management.routes').then(
    (m) => m.maintenanceManagementRoutes,
  );
const billingRoutes = () =>
  import('./billing/presentation/billing.routes').then((m) => m.billingRoutes);
const pageNotFound = () =>
  import('./shared/presentation/views/page-not-found/page-not-found').then((m) => m.PageNotFound);

/**
 * @summary Defines the routes configuration used by the application.
 */
export const routes: Routes = [
  { path: 'identity-access', loadChildren: identityAccessRoutes },
  {
    path: 'asset-management',
    canMatch: [authenticatedCanMatch],
    loadChildren: assetManagementRoutes,
  },
  {
    path: 'monitoring',
    canMatch: [authenticatedCanMatch],
    loadChildren: monitoringRoutes,
  },
  {
    path: 'reports',
    canMatch: [authenticatedCanMatch],
    loadChildren: reportsRoutes,
  },
  {
    path: 'alerts',
    canMatch: [authenticatedCanMatch],
    loadChildren: alertsRoutes,
  },
  {
    path: 'maintenance',
    canMatch: [authenticatedCanMatch],
    loadChildren: maintenanceManagementRoutes,
  },
  {
    path: 'settings',
    canMatch: [authenticatedCanMatch],
    loadChildren: billingRoutes,
  },
  { path: '', redirectTo: '/identity-access/sign-in', pathMatch: 'full' },
  { path: '**', loadComponent: pageNotFound, title: 'ColdTrace - Page Not Found' },
];
