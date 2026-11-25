import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { DatePipe } from '@angular/common';

import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AssetManagementApi } from '../../../../asset-management/infrastructure/asset-management-api';
import { Asset } from '../../../../asset-management/domain/model/asset.entity';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';

import { TranslateModule } from '@ngx-translate/core';

import { IncrementApi, AlertRow, Notice } from '../../../../shared/infrastructure/increment-api';

@Component({
  selector: 'app-alert-inbox',
  imports: [DatePipe, RouterLink, TranslateModule, MatIconModule, ListPagination],
  styleUrl: './alert-inbox.css',
  templateUrl: './alert-inbox.html',
})
export class AlertInbox {
  private readonly api = inject(IncrementApi);
  private readonly assetApi = inject(AssetManagementApi);
  protected readonly notificationMode =
    inject(ActivatedRoute).snapshot.routeConfig?.path === 'notifications';
  protected readonly assets = signal<Asset[]>([]);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly openCount = computed(
    () => this.alerts().filter((row) => row.status === 'OPEN').length,
  );
  protected readonly assignedCount = computed(
    () => this.alerts().filter((row) => row.status === 'ACKNOWLEDGED').length,
  );
  protected readonly filtered = computed(() =>
    this.alerts().filter(
      (row) =>
        (!this.status() || row.status === this.status()) &&
        `${this.assetName(row.asset_id)} ${row.type} ${row.status}`
          .toLowerCase()
          .includes(this.search().toLowerCase()),
    ),
  );
  protected readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * 10, this.page() * 10),
  );
  protected readonly alerts = signal<AlertRow[]>([]);
  protected readonly notices = signal<Notice[]>([]);
  protected readonly error = signal(false);

  constructor() {
    this.assetApi.getAssets().subscribe({ next: (rows) => this.assets.set(rows), error: () => {} });
    this.load();
    const abort = new AbortController();
    void this.api.stream(
      abort.signal,
      () => this.load(),
      () => {},
    );
    inject(DestroyRef).onDestroy(() => abort.abort());
  }

  protected load() {
    this.error.set(false);
    this.api.get<AlertRow[]>('/api/v1/alerts').subscribe({
      next: (rows) => {
        this.alerts.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.api
      .get<Notice[]>('/api/v1/notifications')
      .subscribe({ next: (rows) => this.notices.set(rows), error: () => this.error.set(true) });
  }

  protected assetName(id: number): string {
    return this.assets().find((asset) => asset.id === id)?.name ?? `#${id}`;
  }
  protected filter(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }
  protected filterStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
  }
  protected utc(value: string): string {
    return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  }
}
