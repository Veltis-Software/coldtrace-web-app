import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

type DashboardAiTone = 'ok' | 'warning' | 'critical';

interface DashboardAiSignal {
  icon: string;
  labelKey: string;
  value: string;
  descriptionKey: string;
  tone: DashboardAiTone;
  params?: Record<string, number | string>;
}

interface DashboardAiPrompt {
  id: string;
  textKey: string;
}

/**
 * @summary Presents the AI interpretation assistant for the operational dashboard.
 */
@Component({
  selector: 'app-dashboard-ai-assistant',
  standalone: true,
  imports: [FormsModule, MatIconModule, TranslateModule],
  templateUrl: './dashboard-ai-assistant.html',
  styleUrl: './dashboard-ai-assistant.css',
})
export class DashboardAiAssistant {
  private readonly translate = inject(TranslateService);

  @Input() thermalCompliance = 0;
  @Input() activeIncidents = 0;
  @Input() criticalIncidents = 0;
  @Input() monitoredAssets = 0;
  @Input() activeSensors = 0;
  @Input() readingsCount = 0;
  @Input() maintenanceCompletion = 0;
  @Input() assetIssueCount = 0;

  protected readonly question = signal('');
  protected readonly answer = signal('');
  protected readonly expanded = signal(false);
  protected readonly suggestedQuestions: DashboardAiPrompt[] = [
    { id: 'risk', textKey: 'monitoring.operational.ai-question-risk' },
    { id: 'compliance', textKey: 'monitoring.operational.ai-question-compliance' },
    { id: 'next', textKey: 'monitoring.operational.ai-question-next' },
  ];

  protected get insightTone(): DashboardAiTone {
    if (this.criticalIncidents > 0 || this.thermalCompliance < 85) {
      return 'critical';
    }

    if (this.activeIncidents > 0 || this.assetIssueCount > 0 || this.thermalCompliance < 95) {
      return 'warning';
    }

    return 'ok';
  }

  protected get insightStatusKey(): string {
    return `monitoring.operational.ai-status-${this.insightTone}`;
  }

  protected get summaryKey(): string {
    return `monitoring.operational.ai-summary-${this.insightTone}`;
  }

  protected get summaryParams(): Record<string, number> {
    return {
      compliance: this.thermalCompliance,
      incidents: this.activeIncidents,
      critical: this.criticalIncidents,
      readings: this.readingsCount,
      maintenance: this.maintenanceCompletion,
    };
  }

  protected get signals(): DashboardAiSignal[] {
    return [
      {
        icon: 'device_thermostat',
        labelKey: 'monitoring.operational.ai-signal-compliance',
        value: `${this.thermalCompliance}%`,
        descriptionKey: 'monitoring.operational.ai-signal-compliance-body',
        tone: this.thermalCompliance >= 95 ? 'ok' : this.thermalCompliance >= 85 ? 'warning' : 'critical',
        params: { compliance: this.thermalCompliance },
      },
      {
        icon: 'report_problem',
        labelKey: 'monitoring.operational.ai-signal-incidents',
        value: `${this.activeIncidents}`,
        descriptionKey: 'monitoring.operational.ai-signal-incidents-body',
        tone: this.criticalIncidents > 0 ? 'critical' : this.activeIncidents > 0 ? 'warning' : 'ok',
        params: { incidents: this.activeIncidents, critical: this.criticalIncidents },
      },
      {
        icon: 'construction',
        labelKey: 'monitoring.operational.ai-signal-maintenance',
        value: `${this.maintenanceCompletion}%`,
        descriptionKey: 'monitoring.operational.ai-signal-maintenance-body',
        tone: this.maintenanceCompletion >= 85 ? 'ok' : 'warning',
        params: { maintenance: this.maintenanceCompletion },
      },
    ];
  }

  protected updateQuestion(value: string): void {
    this.question.set(value);
  }

  protected openPanel(): void {
    this.expanded.set(true);
  }

  protected closePanel(): void {
    this.expanded.set(false);
  }

  protected askSuggestedQuestion(prompt: DashboardAiPrompt): void {
    this.askQuestion(this.translate.instant(prompt.textKey));
  }

  protected askQuestion(question = this.question()): void {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
      return;
    }

    this.question.set(normalizedQuestion);
    this.answer.set(this.answerFor(normalizedQuestion));
  }

  private answerFor(question: string): string {
    const normalizedQuestion = question.toLowerCase();
    const params = {
      assets: this.monitoredAssets,
      sensors: this.activeSensors,
      compliance: this.thermalCompliance,
      incidents: this.activeIncidents,
      critical: this.criticalIncidents,
      readings: this.readingsCount,
      maintenance: this.maintenanceCompletion,
      issues: this.assetIssueCount,
    };

    if (
      normalizedQuestion.includes('riesgo') ||
      normalizedQuestion.includes('risk') ||
      normalizedQuestion.includes('prioridad') ||
      normalizedQuestion.includes('priority')
    ) {
      return this.translate.instant('monitoring.operational.ai-answer-risk', params);
    }

    if (
      normalizedQuestion.includes('cumplimiento') ||
      normalizedQuestion.includes('compliance') ||
      normalizedQuestion.includes('temperatura') ||
      normalizedQuestion.includes('temperature')
    ) {
      return this.translate.instant('monitoring.operational.ai-answer-compliance', params);
    }

    if (
      normalizedQuestion.includes('siguiente') ||
      normalizedQuestion.includes('hacer') ||
      normalizedQuestion.includes('next') ||
      normalizedQuestion.includes('action')
    ) {
      return this.translate.instant('monitoring.operational.ai-answer-next', params);
    }

    return this.translate.instant('monitoring.operational.ai-answer-default', params);
  }
}
