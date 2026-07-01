import { BaseEntity } from '../../../shared/domain/model/base-entity';
import { ReportType } from './report-type.enum';

/**
 * @summary Represents a report in the reports bounded context.
 */
export class Report implements BaseEntity {
  constructor(
    public id: number,
    public organizationId: number,
    public uuid: string,
    public type: ReportType,
    public title: string,
    public periodDate: string,
    public generatedAt: string,
    public assetCount: number | null = null,
    public readingCount: number | null = null,
    public outOfRangeReadingCount: number | null = null,
    public incidentCount: number | null = null,
    public openIncidentCount: number | null = null,
    public averageTemperature: number | null = null,
    public averageHumidity: number | null = null,
    public compliancePercentage: number | null = null,
  ) {}
}
