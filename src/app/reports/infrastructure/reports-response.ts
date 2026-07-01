import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';
import { ReportType } from '../domain/model/report-type.enum';

/**
 * @summary Raw report resource from the ColdTrace API.
 */
export interface ReportResource extends BaseResource {
  organizationId: number;
  uuid: string;
  type: ReportType | string;
  title: string;
  periodDate?: string;
  periodStart?: string;
  periodEnd?: string;
  generatedAt: string;
  assetCount?: number;
  readingCount?: number;
  outOfRangeReadingCount?: number;
  incidentCount?: number;
  openIncidentCount?: number;
  averageTemperature?: number | null;
  averageHumidity?: number | null;
  compliancePercentage?: number | null;
}

/**
 * @summary Raw response from the ColdTrace API for reports.
 */
export interface ReportsResponse extends BaseResponse {
  reports: ReportResource[];
}

/**
 * @summary Request payload for backend-owned report generation.
 */
export interface GenerateReportRequest {
  type: string;
  title: string;
  periodStart: string;
  periodEnd: string;
}
