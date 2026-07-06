import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, switchMap } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Incident } from '../domain/model/incident.entity';
import { Notification } from '../domain/model/notification.entity';
import { AiResolutionPlansApiEndpoint } from './ai-resolution-plans-api-endpoint';
import {
  AiResolutionPlanResource,
  ApproveAiResolutionPlanRequest,
  RejectAiResolutionPlanRequest,
} from './ai-resolution-plan-resource';
import { IncidentsApiEndpoint } from './incidents-api-endpoint';
import { NotificationsApiEndpoint } from './notifications-api-endpoint';

/**
 * @summary Groups alerts API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class AlertsApi extends BaseApi {
  private readonly incidentsEndpoint: IncidentsApiEndpoint;
  private readonly notificationsEndpoint: NotificationsApiEndpoint;
  private readonly aiResolutionPlansEndpoint: AiResolutionPlansApiEndpoint;

  constructor(http: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.incidentsEndpoint = new IncidentsApiEndpoint(http, organizationScope);
    this.notificationsEndpoint = new NotificationsApiEndpoint(http, organizationScope);
    this.aiResolutionPlansEndpoint = new AiResolutionPlansApiEndpoint(http, organizationScope);
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

  /**
   * @summary Fetches AI resolution plan history for one incident.
   */
  getAiResolutionPlans(incidentId: number): Observable<AiResolutionPlanResource[]> {
    return this.aiResolutionPlansEndpoint.getAll(incidentId);
  }

  /**
   * @summary Generates an AI-assisted resolution plan for one incident.
   */
  generateAiResolutionPlan(incidentId: number): Observable<AiResolutionPlanResource> {
    return this.aiResolutionPlansEndpoint.generate(incidentId);
  }

  /**
   * @summary Approves an AI plan through the backend lifecycle endpoint.
   */
  approveAiResolutionPlan(
    incidentId: number,
    planId: number,
    request: ApproveAiResolutionPlanRequest,
  ): Observable<AiResolutionPlanResource> {
    return this.aiResolutionPlansEndpoint.approve(incidentId, planId, request);
  }

  /**
   * @summary Rejects an AI plan through the backend lifecycle endpoint.
   */
  rejectAiResolutionPlan(
    incidentId: number,
    planId: number,
    request: RejectAiResolutionPlanRequest,
  ): Observable<AiResolutionPlanResource> {
    return this.aiResolutionPlansEndpoint.reject(incidentId, planId, request);
  }
}
