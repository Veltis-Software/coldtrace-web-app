import { Component, computed, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

type PlanStatus = 'pending' | 'approved' | 'rejected';

interface PrototypeIncident {
  id: number;
  asset: string;
  location: string;
  reading: string;
  safeRange: string;
  status: string;
  risk: string;
}

interface ResolutionStep {
  title: string;
  detail: string;
  owner: string;
}

interface PlanHistoryItem {
  id: number;
  status: PlanStatus;
  title: string;
  actor: string;
  date: string;
  note: string;
}

@Component({
  selector: 'app-ai-guidance-prototype',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './ai-guidance-prototype.html',
  styleUrl: './ai-guidance-prototype.css',
})
export class AiGuidancePrototype {
  protected readonly incidents: PrototypeIncident[] = [
    {
      id: 1007,
      asset: 'Cold Room 03',
      location: 'Miraflores warehouse',
      reading: '9.4 °C for 24 min',
      safeRange: '2 °C - 6 °C',
      status: 'Recognized',
      risk: 'High',
    },
    {
      id: 1008,
      asset: 'Truck 08',
      location: 'Surco route',
      reading: '82% humidity',
      safeRange: '55% - 70%',
      status: 'Open',
      risk: 'Medium',
    },
    {
      id: 1009,
      asset: 'Frozen Storage 02',
      location: 'San Borja site',
      reading: '-11 °C for 12 min',
      safeRange: '-20 °C - -14 °C',
      status: 'Open',
      risk: 'High',
    },
  ];

  protected readonly selectedIncidentId = signal(this.incidents[0].id);
  protected readonly planStatus = signal<PlanStatus>('pending');
  protected readonly generating = signal(false);
  protected readonly feedback = signal('AI plan ready for operator review.');
  protected readonly rejectionReason = signal('');
  protected readonly finalAction = signal(
    'Move affected batch to backup cold room, inspect door seal, and keep readings under observation for 30 minutes.',
  );

  protected readonly selectedIncident = computed(
    () =>
      this.incidents.find((incident) => incident.id === this.selectedIncidentId()) ??
      this.incidents[0],
  );

  protected readonly planSteps: ResolutionStep[] = [
    {
      title: 'Stabilize product exposure',
      detail: 'Move the affected batch to Cold Room 01 while the current room returns to safe range.',
      owner: 'Operator',
    },
    {
      title: 'Inspect door and gateway events',
      detail: 'Review recent door opening logs and gateway connectivity before marking the cause.',
      owner: 'Operations manager',
    },
    {
      title: 'Verify corrective evidence',
      detail: 'Confirm 30 minutes of stable readings and attach the final corrective note to the incident.',
      owner: 'Quality owner',
    },
  ];

  protected readonly history = computed<PlanHistoryItem[]>(() => {
    const incident = this.selectedIncident();
    const currentStatus = this.planStatus();
    const currentNote =
      currentStatus === 'approved'
        ? 'Approved plan closed the incident with corrective evidence.'
        : currentStatus === 'rejected'
          ? this.rejectionReason() || 'Rejected because the recommendation does not match site context.'
          : 'Generated plan is waiting for operator approval.';

    return [
      {
        id: 1,
        status: currentStatus,
        title: `${incident.asset} AI resolution plan`,
        actor: currentStatus === 'pending' ? 'ColdTrace AI' : 'Mauricio Pajés',
        date: 'Today, 09:42',
        note: currentNote,
      },
      {
        id: 2,
        status: 'rejected',
        title: 'Previous humidity recommendation',
        actor: 'Laura Mendoza',
        date: 'Yesterday, 17:18',
        note: 'Rejected because maintenance had already replaced the sensor probe.',
      },
    ];
  });

  protected selectIncident(value: string): void {
    this.selectedIncidentId.set(Number(value));
    this.planStatus.set('pending');
    this.feedback.set('AI plan ready for operator review.');
    this.rejectionReason.set('');
  }

  protected generatePlan(): void {
    this.generating.set(true);
    this.feedback.set('Building plan from incident, asset, readings, safe range, and history.');
    window.setTimeout(() => {
      this.generating.set(false);
      this.planStatus.set('pending');
      this.feedback.set('AI plan regenerated. Operator approval is still required.');
    }, 700);
  }

  protected approvePlan(): void {
    this.planStatus.set('approved');
    this.feedback.set('Plan approved. The backend would close the incident and persist the corrective action.');
  }

  protected rejectPlan(): void {
    const reason = this.rejectionReason().trim();

    if (!reason) {
      this.feedback.set('Add a rejection reason before saving the decision.');
      return;
    }

    this.planStatus.set('rejected');
    this.feedback.set('Plan rejected. The incident remains open and the reason is saved in history.');
  }

  protected updateFinalAction(value: string): void {
    this.finalAction.set(value);
  }

  protected updateRejectionReason(value: string): void {
    this.rejectionReason.set(value);
  }

  protected statusIcon(status: PlanStatus): string {
    switch (status) {
      case 'approved':
        return 'task_alt';
      case 'rejected':
        return 'cancel';
      default:
        return 'pending_actions';
    }
  }
}
