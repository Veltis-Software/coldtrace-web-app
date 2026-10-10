import { Routes } from '@angular/router';

const operationalDashboard = () =>
  import('./views/operational-dashboard/operational-dashboard').then(
    (m) => m.OperationalDashboard,
  );
const assetMonitoringDashboard = () =>
  import('./views/current-states/current-states').then((m) => m.CurrentStates);

/**
 * @summary Defines the lazy-loaded routes for the monitoring bounded context.
 */
export const monitoringRoutes: Routes = [
  {
    path: 'operational',
    loadComponent: operationalDashboard,
    title: 'ColdTrace - Monitoring',
    data: { pageTitleKey: 'monitoring.operational.title' },
  },
  {
    path: 'assets',
    loadComponent: assetMonitoringDashboard,
    title: 'ColdTrace - Asset Monitoring',
    data: { pageTitleKey: 'monitoring.asset-monitoring.page-title' },
  },
  { path: '', redirectTo: 'assets', pathMatch: 'full' },
];
