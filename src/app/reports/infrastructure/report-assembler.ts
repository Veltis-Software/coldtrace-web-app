import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { Report } from '../domain/model/report.entity';
import { ReportType } from '../domain/model/report-type.enum';
import { ReportResource, ReportsResponse } from './reports-response';

/**
 * @summary Maps report data between domain entities and API resources.
 */
export class ReportAssembler implements BaseAssembler<Report, ReportResource, ReportsResponse> {
  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: ReportsResponse): Report[] {
    return response.reports.map((resource) => this.toEntityFromResource(resource));
  }

  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: ReportResource): Report {
    return new Report(
      Number(resource.id),
      resource.organizationId,
      resource.uuid,
      this.reportTypeFrom(resource.type),
      resource.title,
      resource.periodDate ?? this.periodDateFrom(resource),
      resource.generatedAt,
      resource.assetCount ?? null,
      resource.readingCount ?? null,
      resource.outOfRangeReadingCount ?? null,
      resource.incidentCount ?? null,
      resource.openIncidentCount ?? null,
      resource.averageTemperature ?? null,
      resource.averageHumidity ?? null,
      resource.compliancePercentage ?? null,
    );
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: Report): ReportResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      uuid: entity.uuid,
      type: entity.type,
      title: entity.title,
      periodDate: entity.periodDate,
      generatedAt: entity.generatedAt,
      assetCount: entity.assetCount ?? undefined,
      readingCount: entity.readingCount ?? undefined,
      outOfRangeReadingCount: entity.outOfRangeReadingCount ?? undefined,
      incidentCount: entity.incidentCount ?? undefined,
      openIncidentCount: entity.openIncidentCount ?? undefined,
      averageTemperature: entity.averageTemperature,
      averageHumidity: entity.averageHumidity,
      compliancePercentage: entity.compliancePercentage,
    };
  }

  private reportTypeFrom(type: string): Report['type'] {
    const typeByBackendValue: Record<string, Report['type']> = {
      DAILY_LOG: ReportType.DailyLog,
      COMPLIANCE: ReportType.Compliance,
      MONTHLY_SUMMARY: ReportType.MonthlySummary,
      daily_log: ReportType.DailyLog,
      compliance: ReportType.Compliance,
      monthly_summary: ReportType.MonthlySummary,
      'daily-log': ReportType.DailyLog,
      'monthly-summary': ReportType.MonthlySummary,
    };

    return typeByBackendValue[type] ?? ReportType.DailyLog;
  }

  private periodDateFrom(resource: ReportResource): string {
    if (resource.periodStart && resource.periodEnd) {
      const fromDate = resource.periodStart.slice(0, 10);
      const toDate = resource.periodEnd.slice(0, 10);
      return fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
    }

    return '';
  }
}
