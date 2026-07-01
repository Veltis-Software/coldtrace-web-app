import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Report } from '../domain/model/report.entity';
import { ReportsApiEndpoint } from './reports-api-endpoint';

/**
 * @summary Groups reports API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi extends BaseApi {
  private readonly reportsEndpoint: ReportsApiEndpoint;

  constructor(httpClient: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.reportsEndpoint = new ReportsApiEndpoint(httpClient, organizationScope);
  }

  /**
   * @summary Fetches reports from the API endpoint.
   */
  getReports(): Observable<Report[]> {
    return this.reportsEndpoint.getAll();
  }

  /**
   * @summary Persists a report through the API endpoint.
   */
  createReport(report: Report): Observable<Report> {
    return this.reportsEndpoint.create(report);
  }
}
