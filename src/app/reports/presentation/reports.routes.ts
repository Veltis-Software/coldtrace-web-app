import { Routes } from '@angular/router';

const dailyLog = () => import('./views/daily-log/daily-log').then((m) => m.DailyLog);
const monthlyReport = () =>
  import('./views/monthly-report/monthly-report').then((m) => m.MonthlyReport);
const operationalHistory = () =>
  import('./views/operational-history/operational-history').then((m) => m.OperationalHistory);
const sanitaryCompliance = () =>
  import('./views/sanitary-compliance/sanitary-compliance').then((m) => m.SanitaryCompliance);
const aiComplianceSummary = () =>
  import('./views/ai-compliance-summary/ai-compliance-summary').then(
    (m) => m.AiComplianceSummary,
  );
const complianceFindings = () =>
  import('./views/compliance-findings/compliance-findings').then((m) => m.ComplianceFindings);
const auditEvidence = () =>
  import('./views/audit-evidence/audit-evidence').then((m) => m.AuditEvidence);

/**
 * @summary Defines the lazy-loaded routes for the reports bounded context.
 */
export const reportsRoutes: Routes = [
  {
    path: 'daily-log',
    loadComponent: dailyLog,
    title: 'ColdTrace - Daily Log',
  },
  {
    path: 'monthly',
    loadComponent: monthlyReport,
    title: 'ColdTrace - Monthly Report',
  },
  {
    path: 'history',
    loadComponent: operationalHistory,
    title: 'ColdTrace - Operational History',
  },
  {
    path: 'compliance',
    loadComponent: sanitaryCompliance,
    title: 'ColdTrace - Sanitary Compliance',
  },
  {
    path: 'ai-summary',
    loadComponent: aiComplianceSummary,
    title: 'ColdTrace - AI Compliance Summary',
  },
  {
    path: 'findings',
    loadComponent: complianceFindings,
    title: 'ColdTrace - Compliance Findings',
  },
  {
    path: 'audit-evidence',
    loadComponent: auditEvidence,
    title: 'ColdTrace - Audit Evidence',
  },
  { path: '', redirectTo: 'daily-log', pathMatch: 'full' },
];
