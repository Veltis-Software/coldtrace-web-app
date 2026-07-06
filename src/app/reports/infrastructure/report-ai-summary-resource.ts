import { ReportResource } from './reports-response';

export interface ReportAiSummaryFindingResource {
  area: string;
  status: string;
  evidence: string;
  recommendation: string;
}

export interface ReportAiSummaryResource {
  organizationId: number;
  reportId: number;
  reportUuid: string;
  reportType: string;
  reportTitle: string;
  summaryGeneratedAt: string;
  sourceReport: ReportResource;
  executiveSummary: string;
  findings: ReportAiSummaryFindingResource[];
  evidenceGaps: string[];
  recommendedActions: string[];
  uncertaintyNotes: string[];
  modelProvider: string;
  modelName: string;
}
