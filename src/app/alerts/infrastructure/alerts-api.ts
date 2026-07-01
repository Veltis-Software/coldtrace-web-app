import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, switchMap } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Incident } from '../domain/model/incident.entity';
import { Notification } from '../domain/model/notification.entity';
import { IncidentsApiEndpoint } from './incidents-api-endpoint';
import { NotificationsApiEndpoint } from './notifications-api-endpoint';

/**
 * @summary Groups alerts API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class AlertsApi extends BaseApi {
  private readonly incidentsEndpoint: IncidentsApiEndpoint;
  private readonly notificationsEndpoint: NotificationsApiEndpoint;

  constructor(http: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.incidentsEndpoint = new IncidentsApiEndpoint(http, organizationScope);
    this.notificationsEndpoint = new NotificationsApiEndpoint(http, organizationScope);
  }

  /**
   * @summary Fetches incidents from the API endpoint.
   */
  getIncidents(): Observable<Incident[]> {
    return this.incidentsEndpoint.getAll();
  }

  /**
   * @summary Persists an incident through the API endpoint.
   */
  createIncident(incident: Incident): Observable<Incident> {
    return this.incidentsEndpoint.create(incident);
  }

  /**
   * @summary Updates an incident through the API endpoint.
   */
  updateIncident(incident: Incident): Observable<Incident> {
    if (incident.isClosed) {
      const correctiveActionRequest = incident.correctiveAction
        ? this.incidentsEndpoint.registerCorrectiveAction(incident)
        : of(incident);

      return correctiveActionRequest.pipe(
        switchMap(() => this.incidentsEndpoint.resolve(incident)),
      );
    }

    if (incident.isEscalated) {
      return this.incidentsEndpoint.escalate(incident);
    }

    if (incident.isRecognized) {
      return this.incidentsEndpoint.acknowledge(incident);
    }

    return of(incident);
  }

  /**
   * @summary Fetches notifications from the API endpoint.
   */
  getNotifications(): Observable<Notification[]> {
    return this.notificationsEndpoint.getAll();
  }

  /**
   * @summary Fetches notifications linked to one incident.
   */
  getNotificationsByIncidentId(incidentId: number): Observable<Notification[]> {
    return this.incidentsEndpoint.getNotifications(incidentId);
  }
}
