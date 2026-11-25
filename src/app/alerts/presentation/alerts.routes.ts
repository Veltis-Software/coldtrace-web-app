import { Routes } from '@angular/router';

const incidentList = () =>
  import('./views/alert-inbox/alert-inbox').then((m) => m.AlertInbox);
const aiGuidance = () =>
  import('./views/ai-guidance/ai-guidance').then((m) => m.AiGuidance);
const notificationList = () =>
  import('./views/alert-inbox/alert-inbox').then((m) => m.AlertInbox);

/**
 * @summary Defines the lazy-loaded routes for the alerts bounded context.
 */
export const alertsRoutes: Routes = [
  {
    path: 'incidents',
    loadComponent: incidentList,
    title: 'ColdTrace - Incidents',
  },
  {
    path: 'ai-guidance',
    loadComponent: aiGuidance,
    title: 'ColdTrace - AI Guidance',
  },
  {
    path: 'notifications',
    loadComponent: notificationList,
    title: 'ColdTrace - Notifications',
  },
  { path: ':id', loadComponent: () => import('./views/alert-detail/alert-detail').then(m => m.AlertDetailView), title: 'ColdTrace - Alert' },
  { path: '', redirectTo: 'incidents', pathMatch: 'full' },
];
