import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * @summary Stores the organization selected by the current user session.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationScopeStore {
  private readonly activeOrganizationIdSignal = signal<number | null>(null);

  readonly activeOrganizationId = this.activeOrganizationIdSignal.asReadonly();

  setActiveOrganizationId(organizationId: number | null): void {
    this.activeOrganizationIdSignal.set(organizationId);
  }

  endpointUrlFor(resourcePath: string): string {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return '';
    }

    return this.endpointUrlForOrganization(organizationId, resourcePath);
  }

  endpointUrlForOrganization(organizationId: number, resourcePath: string): string {
    return `${environment.platformProviderApiBaseUrl}/organizations/${organizationId}/${resourcePath}`;
  }

  organizationUrl(): string {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return '';
    }

    return `${environment.platformProviderApiBaseUrl}/organizations/${organizationId}`;
  }
}
