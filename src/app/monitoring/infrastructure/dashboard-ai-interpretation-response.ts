export interface DashboardAiInterpretationRequest {
  question?: string;
  preferredLanguage?: string;
}

export interface DashboardAiMetricInsightResource {
  title: string;
  metric: string;
  interpretation: string;
  severity: string;
}

export interface DashboardAiSourceMetricResource {
  name: string;
  value: string | number;
  unit: string;
  description: string;
}

export interface DashboardAiInterpretationResource {
  organizationId: number;
  question: string;
  generatedAt: string;
  overallReading: string;
  attentionLevel: string;
  metricInsights: DashboardAiMetricInsightResource[];
  risks: string[];
  recommendedActions: string[];
  uncertaintyNotes: string[];
  sourceMetrics: DashboardAiSourceMetricResource[];
  modelProvider: string;
  modelName: string;
}
