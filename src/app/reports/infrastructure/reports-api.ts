import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Report } from '../domain/model/report.entity';
import { ReportAiSummaryApiEndpoint } from './report-ai-summary-api-endpoint';
import { ReportAiSummaryResource } from './report-ai-summary-resource';
import { ReportsApiEndpoint } from './reports-api-endpoint';

/**
 * @summary Groups reports API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi extends BaseApi {
  private readonly reportsEndpoint: ReportsApiEndpoint;
  private readonly reportAiSummaryEndpoint: ReportAiSummaryApiEndpoint;

  constructor(httpClient: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.reportsEndpoint = new ReportsApiEndpoint(httpClient, organizationScope);
    this.reportAiSummaryEndpoint = new ReportAiSummaryApiEndpoint(
      httpClient,
      organizationScope,
    );
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

  /**
   * @summary Generates an advisory AI summary for one persisted report.
   */
  generateAiSummary(reportId: number): Observable<ReportAiSummaryResource> {
    return this.reportAiSummaryEndpoint.generate(reportId);
  }
}
