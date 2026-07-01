import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Incident } from '../domain/model/incident.entity';
import { Notification } from '../domain/model/notification.entity';
import { IncidentAssembler } from './incident-assembler';
import {
  AcknowledgeIncidentRequest,
  CreateIncidentRequest,
  EscalateIncidentRequest,
  IncidentResource,
  IncidentsResponse,
  RegisterCorrectiveActionRequest,
  ResolveIncidentRequest,
} from './incident-resource';
import { NotificationAssembler } from './notification-assembler';
import { NotificationResource } from './notifications-response';

/**
 * @summary Connects incidents API endpoint resources to the generic API endpoint contract.
 */
export class IncidentsApiEndpoint extends BaseApiEndpoint<Incident, IncidentResource, IncidentsResponse, IncidentAssembler> {
  private readonly notificationAssembler = new NotificationAssembler();

  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new IncidentAssembler());
  }

  /**
   * @summary Fetches incidents for the active organization.
   */
  override getAll(): Observable<Incident[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  override create(incident: Incident): Observable<Incident> {
    const request: CreateIncidentRequest = {
      assetId: incident.assetId > 0 ? incident.assetId : null,
      deviceId: null,
      readingId: incident.sourceReadingId,
      assetName: incident.assetName,
      deviceName: null,
      type: incident.type,
      severity: incident.severity,
      value: incident.value,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<IncidentResource>(this.endpointUrl, request)
      .pipe(
        map((created) => this.assembler.toEntityFromResource(created)),
        catchError(this.handleError('Failed to create incident')),
      );
  }

  acknowledge(incident: Incident): Observable<Incident> {
    const request: AcknowledgeIncidentRequest = {
      acknowledgedBy: incident.recognizedBy ?? 'ColdTrace User',
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .post<IncidentResource>(`${this.endpointUrl}/${incident.id}/acknowledgements`, request)
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  escalate(incident: Incident): Observable<Incident> {
    const request: EscalateIncidentRequest = {
      escalatedBy: incident.escalatedTo ?? 'ColdTrace User',
      escalationReason: this.escalationReasonFrom(incident),
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .patch<IncidentResource>(`${this.endpointUrl}/${incident.id}/escalation`, request)
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  registerCorrectiveAction(incident: Incident): Observable<Incident> {
    const request: RegisterCorrectiveActionRequest = {
      correctiveAction: incident.correctiveAction ?? 'Corrective action registered.',
      registeredBy: incident.closedBy ?? incident.recognizedBy ?? 'ColdTrace User',
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .patch<IncidentResource>(`${this.endpointUrl}/${incident.id}/corrective-action`, request)
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  resolve(incident: Incident): Observable<Incident> {
    const request: ResolveIncidentRequest = {
      resolvedBy: incident.closedBy ?? incident.recognizedBy ?? 'ColdTrace User',
      resolutionNotes: incident.correctiveAction ?? incident.closureEvidence ?? 'Incident resolved.',
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .post<IncidentResource>(`${this.endpointUrl}/${incident.id}/resolutions`, request)
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  getNotifications(incidentId: number): Observable<Notification[]> {
    this.useActiveOrganizationEndpoint();

    return this.http.get<NotificationResource[]>(`${this.endpointUrl}/${incidentId}/notifications`)
      .pipe(
        map((notifications) =>
          notifications.map((notification) =>
            this.notificationAssembler.toEntityFromResource(notification),
          ),
        ),
        catchError(this.handleError('Failed to fetch incident notifications')),
      );
  }

  private escalationReasonFrom(incident: Incident): string {
    if (incident.escalationPolicyMinutes) {
      return `Incident remained active for ${incident.escalationPolicyMinutes} minutes.`;
    }

    return 'Incident requires escalation according to the active policy.';
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('incidents');
  }
}
