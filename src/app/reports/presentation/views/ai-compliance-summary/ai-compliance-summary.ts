import { Component, computed, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type SummaryState = 'ready' | 'generated' | 'insufficient';

interface SummaryMetric {
  labelKey: string;
  value: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}

interface RiskInsight {
  titleKey: string;
  descriptionKey: string;
  severity: 'medium' | 'high';
}

@Component({
  selector: 'app-ai-compliance-summary',
  standalone: true,
  imports: [MatIcon, RouterLink, TranslatePipe],
  templateUrl: './ai-compliance-summary.html',
  styleUrl: './ai-compliance-summary.css',
})
export class AiComplianceSummary {
  protected readonly state = signal<SummaryState>('generated');
  protected readonly selectedReport = signal('reports.ai-summary.report-june');

  protected readonly metrics: SummaryMetric[] = [
    { labelKey: 'reports.ai-summary.metric-assets', value: '18', tone: 'blue' },
    { labelKey: 'reports.ai-summary.metric-compliance', value: '92%', tone: 'green' },
    { labelKey: 'reports.ai-summary.metric-incidents', value: '4', tone: 'amber' },
    { labelKey: 'reports.ai-summary.metric-findings', value: '2', tone: 'red' },
  ];

  protected readonly risks: RiskInsight[] = [
    {
      titleKey: 'reports.ai-summary.risk-thermal-title',
      descriptionKey: 'reports.ai-summary.risk-thermal-description',
      severity: 'high',
    },
    {
      titleKey: 'reports.ai-summary.risk-humidity-title',
      descriptionKey: 'reports.ai-summary.risk-humidity-description',
      severity: 'medium',
    },
    {
      titleKey: 'reports.ai-summary.risk-evidence-title',
      descriptionKey: 'reports.ai-summary.risk-evidence-description',
      severity: 'medium',
    },
  ];

  protected readonly generatedSummary = computed(() => {
    if (this.state() === 'insufficient') {
      return 'reports.ai-summary.summary-insufficient';
    }

    return 'reports.ai-summary.summary-generated';
  });

  protected generateSummary(): void {
    this.state.set('generated');
  }

  protected showInsufficientState(): void {
    this.state.set('insufficient');
  }

  protected selectReport(value: string): void {
    this.selectedReport.set(value);
    this.state.set('ready');
  }
}
