import { Component, DestroyRef, inject, signal } from '@angular/core';

import { DatePipe, DecimalPipe } from '@angular/common';

import { ActivatedRoute, RouterLink } from '@angular/router';

import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';

import {
  IncrementApi,
  AlertDetail,
  UserRef,
} from '../../../../shared/infrastructure/increment-api';

@Component({
  selector: 'app-alert-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, FormsModule, TranslateModule],
  templateUrl: './alert-detail.html',
  styleUrl: './alert-detail.css',
})
export class AlertDetailView {
  private readonly api = inject(IncrementApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly detail = signal<AlertDetail | null>(null);
  protected readonly members = signal<UserRef[]>([]);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly feedback = signal('');

  protected readonly connected = signal(false);
  protected readonly seconds = signal(0);

  protected assignee = 0;
  protected description = '';
  private deadline = 0;

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  constructor() {
    this.load();
    this.api
      .get<UserRef[]>('/api/v1/alerts/assignees')
      .subscribe({
        next: (users) => this.members.set(users),
        error: () => this.error.set('increment.load-error'),
      });

    const abort = new AbortController();
    void this.api.stream(
      abort.signal,
      () => this.load(),
      (value) => this.connected.set(value),
    );

    const timer = setInterval(
      () => this.seconds.set(Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000))),
      200,
    );

    inject(DestroyRef).onDestroy(() => {
      abort.abort();
      clearInterval(timer);
    });
  }

  protected load() {
    this.api.get<AlertDetail>(`/api/v1/alerts/${this.id}/detail`).subscribe({
      next: (value) => {
        if (this.error() === 'increment.load-error') this.error.set('');
        this.detail.set(value);
        if (!this.assignee) this.assignee = value.suggestedAssignee.userId;
      },
      error: () => this.error.set('increment.load-error'),
    });
  }

  protected acknowledge() {
    this.busy.set(true);
    this.error.set('');

    this.api
      .post<{
        undoAvailableUntil: string;
      }>(`/api/v1/alerts/${this.id}/acknowledgement`, { assigneeUserId: Number(this.assignee) })
      .subscribe({
        next: (result) => {
          this.deadline = Date.parse(result.undoAvailableUntil);
          this.feedback.set('increment.acknowledged');
          this.busy.set(false);
          this.load();
        },

        error: () => {
          this.error.set('increment.action-error');
          this.busy.set(false);
          this.load();
        },
      });
  }

  protected undo() {
    this.busy.set(true);

    this.api.delete(`/api/v1/alerts/${this.id}/acknowledgement`).subscribe({
      next: () => {
        this.deadline = 0;
        this.seconds.set(0);
        this.feedback.set('increment.undone');
        this.busy.set(false);
        this.load();
      },
      error: () => {
        this.error.set('increment.undo-error');
        this.busy.set(false);
        this.load();
      },
    });
  }

  protected saveAction(resolve = false) {
    this.busy.set(true);

    this.api
      .post(`/api/v1/incidents/${this.id}/${resolve ? 'resolution' : 'corrective-actions'}`, {
        description: this.description,
      })
      .subscribe({
        next: () => {
          this.description = '';
          this.feedback.set(resolve ? 'increment.resolved' : 'increment.action-saved');
          this.busy.set(false);
          this.load();
        },
        error: () => {
          this.error.set('increment.action-error');
          this.busy.set(false);
        },
      });
  }
}
