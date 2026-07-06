import { Routes } from '@angular/router';

const incidentList = () =>
  import('./views/incident-list/incident-list').then((m) => m.IncidentList);
const aiGuidance = () =>
  import('./views/ai-guidance/ai-guidance').then((m) => m.AiGuidance);
const notificationList = () =>
  import('./views/notification-list/notification-list').then((m) => m.NotificationList);

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
  { path: '', redirectTo: 'incidents', pathMatch: 'full' },
];
