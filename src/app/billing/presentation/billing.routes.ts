import { Routes } from '@angular/router';

const billingPrototype = () =>
  import('./views/billing-prototype/billing-prototype').then((m) => m.BillingPrototype);

/**
 * @summary Defines the lazy-loaded routes for the billing bounded context.
 */
export const billingRoutes: Routes = [
  {
    path: 'billing',
    loadComponent: billingPrototype,
    title: 'ColdTrace - Billing',
  },
  { path: '', redirectTo: 'billing', pathMatch: 'full' },
];
