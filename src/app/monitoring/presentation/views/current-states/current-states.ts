import { Component, DestroyRef, inject, signal } from '@angular/core';

import { DatePipe, DecimalPipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';

import {
  IncrementApi,
  CurrentState,
  StatePage,
} from '../../../../shared/infrastructure/increment-api';

@Component({
  selector: 'app-current-states',
  imports: [DatePipe, DecimalPipe, FormsModule, TranslateModule],
  styleUrl: '../../../../shared/presentation/increment.css',
  template: ` <section class="increment-view">
    <header>
      <h1>{{ 'increment.current-states' | translate }}</h1>
      <button (click)="load()">{{ 'increment.refresh' | translate }}</button>
    </header>

    <form (ngSubmit)="filter()">
      <label for="status">{{ 'increment.state' | translate }}</label
      ><select id="status" name="status" [(ngModel)]="status">
        <option value="">{{ 'increment.all' | translate }}</option>
        <option>NORMAL</option>
        <option>OUT_OF_RANGE</option>
        <option>NO_DATA</option></select
      ><label for="location">{{ 'increment.location' | translate }}</label
      ><input id="location" name="location" type="number" min="1" [(ngModel)]="location" /><button>
        {{ 'increment.filter' | translate }}
      </button>
    </form>

    @if (error()) {
      <p role="alert" class="error">{{ 'increment.load-error' | translate }}</p>
    }

    @if (loading()) {
      <p role="status">{{ 'increment.loading' | translate }}</p>
    }

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ 'increment.asset' | translate }}</th>
            <th>{{ 'increment.state' | translate }}</th>
            <th>{{ 'increment.temperature' | translate }}</th>
            <th>{{ 'increment.humidity' | translate }}</th>
            <th>{{ 'increment.safe-range' | translate }}</th>
            <th>{{ 'increment.recorded' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (asset of states(); track asset.assetId) {
            <tr>
              <td>{{ asset.assetId }}</td>
              <td [class]="'state ' + asset.status">{{ asset.status }}</td>
              <td>
                {{
                  asset.lastTemperature == null ? '—' : (asset.lastTemperature | number: '1.1-2')
                }}
                °C
              </td>
              <td>
                {{ asset.lastHumidity == null ? '—' : (asset.lastHumidity | number: '1.1-2') }} %
              </td>
              <td>{{ asset.safeRange.minTemperature }}–{{ asset.safeRange.maxTemperature }} °C</td>
              <td>
                {{
                  asset.lastRecordedAt
                    ? (asset.lastRecordedAt | date: 'medium')
                    : ('increment.no-readings' | translate)
                }}
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6">{{ 'increment.no-assets' | translate }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <nav>
      <button [disabled]="page === 0" (click)="changePage(-1)">
        {{ 'increment.previous' | translate }}</button
      ><span>{{ page + 1 }} · {{ total() }} {{ 'increment.assets' | translate }}</span
      ><button [disabled]="(page + 1) * 50 >= total()" (click)="changePage(1)">
        {{ 'increment.next' | translate }}
      </button>
    </nav>
  </section>`,
})
export class CurrentStates {
  private readonly api = inject(IncrementApi);
  protected readonly states = signal<CurrentState[]>([]);
  protected readonly total = signal(0);
  protected readonly error = signal(false);
  protected readonly loading = signal(false);

  protected status = '';
  protected location: number | null = null;
  protected page = 0;

  constructor() {
    this.load();
    const timer = setInterval(() => this.load(), 10000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected filter() {
    this.page = 0;
    this.load();
  }

  protected changePage(delta: number) {
    this.page += delta;
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.error.set(false);
    const params = new URLSearchParams({ page: String(this.page), size: '50' });
    if (this.status) params.set('status', this.status);
    if (this.location) params.set('locationId', String(this.location));
    this.api.get<StatePage>('/api/v1/assets/states?' + params).subscribe({
      next: (result) => {
        this.states.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
