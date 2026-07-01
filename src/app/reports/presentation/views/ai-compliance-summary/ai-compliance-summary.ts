import { Component, computed, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

type SummaryState = 'ready' | 'generated' | 'insufficient';

interface SummaryMetric {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}

interface RiskInsight {
  title: string;
  description: string;
  severity: 'medium' | 'high';
}

@Component({
  selector: 'app-ai-compliance-summary',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './ai-compliance-summary.html',
  styleUrl: './ai-compliance-summary.css',
})
export class AiComplianceSummary {
  protected readonly state = signal<SummaryState>('generated');
  protected readonly selectedReport = signal('June 2026 sanitary compliance');

  protected readonly metrics: SummaryMetric[] = [
    { label: 'Assets reviewed', value: '18', tone: 'blue' },
    { label: 'Compliance rate', value: '92%', tone: 'green' },
    { label: 'Open incidents', value: '4', tone: 'amber' },
    { label: 'Critical findings', value: '2', tone: 'red' },
  ];

  protected readonly risks: RiskInsight[] = [
    {
      title: 'Repeated thermal excursion in Cold Room 03',
      description:
        'Three deviations occurred during receiving hours. The pattern suggests door exposure instead of equipment failure.',
      severity: 'high',
    },
    {
      title: 'Humidity drift in refrigerated transport',
      description:
        'Truck 08 stayed above humidity threshold in two routes. Calibration and gasket inspection should be prioritized.',
      severity: 'medium',
    },
    {
      title: 'Audit evidence gap',
      description:
        'Two incidents were closed with corrective notes but without enough verification detail for an external review.',
      severity: 'medium',
    },
  ];

  protected readonly generatedSummary = computed(() => {
    if (this.state() === 'insufficient') {
      return 'The selected report does not contain enough incidents, readings, and corrective actions to produce a reliable summary.';
    }

    return 'ColdTrace detected a mostly compliant period with localized thermal risk around receiving operations. Corrective actions were documented for the majority of incidents, but two records require stronger verification evidence before an audit package is exported.';
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
