import { Routes } from '@angular/router';

const billingManagement = () =>
  import('./views/billing-management/billing-management').then((m) => m.BillingManagement);

/**
 * @summary Defines the lazy-loaded routes for the billing bounded context.
 */
export const billingRoutes: Routes = [
  {
    path: 'billing',
    loadComponent: billingManagement,
    title: 'ColdTrace - Billing',
  },
  { path: '', redirectTo: 'billing', pathMatch: 'full' },
];
