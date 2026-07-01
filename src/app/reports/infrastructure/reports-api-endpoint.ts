import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Report } from '../domain/model/report.entity';
import { ReportAssembler } from './report-assembler';
import { GenerateReportRequest, ReportResource, ReportsResponse } from './reports-response';

/**
 * @summary Connects reports API endpoint resources to the generic API endpoint contract.
 */
export class ReportsApiEndpoint extends BaseApiEndpoint<
  Report,
  ReportResource,
  ReportsResponse,
  ReportAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new ReportAssembler());
  }

  /**
   * @summary Fetches reports for the active organization.
   */
  override getAll(): Observable<Report[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  override create(report: Report): Observable<Report> {
    const range = this.periodRangeFrom(report.periodDate);
    const request: GenerateReportRequest = {
      type: this.backendReportTypeFrom(report.type),
      title: report.title,
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<ReportResource>(this.endpointUrl, request)
      .pipe(map((created) => this.assembler.toEntityFromResource(created)));
  }

  private backendReportTypeFrom(type: Report['type']): string {
    const backendTypeByReportType: Record<Report['type'], string> = {
      'daily-log': 'DAILY_LOG',
      compliance: 'COMPLIANCE',
      'monthly-summary': 'MONTHLY_SUMMARY',
    };

    return backendTypeByReportType[type];
  }

  private periodRangeFrom(periodDate: string): { periodStart: string; periodEnd: string } {
    if (periodDate.includes(' - ')) {
      const [fromDate, toDate] = periodDate.split(' - ');
      return {
        periodStart: this.startOfDay(fromDate),
        periodEnd: this.endOfDay(toDate),
      };
    }

    if (/^\d{4}-\d{2}$/.test(periodDate)) {
      const [year, month] = periodDate.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();

      return {
        periodStart: this.startOfDay(`${periodDate}-01`),
        periodEnd: this.endOfDay(`${periodDate}-${lastDay.toString().padStart(2, '0')}`),
      };
    }

    return {
      periodStart: this.startOfDay(periodDate),
      periodEnd: this.endOfDay(periodDate),
    };
  }

  private startOfDay(date: string): string {
    return date.includes('T') ? date : `${date}T00:00:00Z`;
  }

  private endOfDay(date: string): string {
    return date.includes('T') ? date : `${date}T23:59:59Z`;
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('reports');
  }
}
