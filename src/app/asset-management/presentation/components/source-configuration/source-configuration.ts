import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  inject,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, forkJoin, of, throwError } from 'rxjs';
import { Asset } from '../../../domain/model/asset.entity';
import { IoTDevice } from '../../../domain/model/iot-device.entity';
import {
  SourceConfiguration as Configuration,
  SourceConfigurationsApi,
} from '../../../infrastructure/source-configurations-api';

@Component({
  selector: 'app-source-configuration',
  imports: [DatePipe, ReactiveFormsModule, MatButton, TranslatePipe],
  templateUrl: './source-configuration.html',
  styleUrl: './source-configuration.css',
})
export class SourceConfiguration implements OnChanges, OnDestroy {
  @Input({ required: true }) device!: IoTDevice;
  @Input() assets: Asset[] = [];
  @Input() canManage = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  private readonly api = inject(SourceConfigurationsApi);
  private readonly fb = inject(FormBuilder);
  private requests = new Subscription();
  readonly current = signal<Configuration | null>(null);
  readonly history = signal<Configuration[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly error = signal('');
  readonly success = signal(false);
  readonly loadFailed = signal(false);
  readonly form = this.fb.nonNullable.group({
    assetId: [0, [Validators.min(1)]],
    sourceId: ['', [Validators.required, Validators.pattern('[A-Za-z0-9_-]{1,64}')]],
    transport: ['mqtt' as 'mqtt' | 'http', Validators.required],
    profileVersion: [1, [Validators.required, Validators.min(1), Validators.pattern('^[0-9]+$')]],
    temperatureUnit: ['C' as 'C' | 'F', Validators.required],
    temperatureField: ['temperature', [Validators.required, Validators.maxLength(128)]],
    humidityField: ['humidity', [Validators.required, Validators.maxLength(128)]],
    recordedAtField: ['recordedAt', [Validators.required, Validators.maxLength(128)]],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['device']) {
      this.success.set(false);
      this.load();
    } else if (changes['canManage'] && !this.canManage) {
      this.editing.set(false);
    }
  }
  ngOnDestroy(): void {
    this.requests.unsubscribe();
  }

  load(): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.loading.set(true);
    this.saving.set(false);
    this.error.set('');
    this.loadFailed.set(false);
    this.editing.set(false);
    this.current.set(null);
    this.history.set([]);
    this.requests.add(
      forkJoin({
        current: this.api
          .current(this.device.organizationId, this.device.id)
          .pipe(
            catchError((error: HttpErrorResponse) =>
              error.status === 404 ? of(null) : throwError(() => error),
            ),
          ),
        history: this.api.history(this.device.organizationId, this.device.id),
      }).subscribe({
        next: ({ current, history }) => {
          this.current.set(current);
          this.history.set(history);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(
            error.status === 403 ? 'source-config.read-forbidden' : 'source-config.load-error',
          );
          this.loadFailed.set(true);
          this.loading.set(false);
        },
      }),
    );
  }

  edit(): void {
    if (!this.canManage || this.loading() || this.loadFailed()) return;
    const current = this.current();
    const profile = current?.profile;
    this.form.reset({
      assetId: current?.assetId ?? this.device.assetId ?? 0,
      sourceId: profile?.sourceId ?? '',
      transport: profile?.transport ?? 'mqtt',
      profileVersion: profile?.profileVersion ?? 1,
      temperatureUnit: profile?.temperatureUnit ?? 'C',
      temperatureField: profile?.fields.temperature ?? 'temperature',
      humidityField: profile?.fields.humidity ?? 'humidity',
      recordedAtField: profile?.fields.recordedAt ?? 'recordedAt',
      reason: '',
    });
    if (current || this.device.assetId) this.form.controls.assetId.disable();
    else this.form.controls.assetId.enable();
    this.error.set('');
    this.success.set(false);
    this.editing.set(true);
  }

  submit(): void {
    if (
      !this.canManage ||
      this.saving() ||
      this.loading() ||
      this.loadFailed() ||
      this.error() === 'source-config.conflict'
    )
      return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const fields = [value.temperatureField, value.humidityField, value.recordedAtField].map(
      (field) => field.trim(),
    );
    if (
      this.form.invalid ||
      fields.some((field) => !field) ||
      new Set(fields).size !== 3 ||
      !value.reason.trim()
    ) {
      this.error.set('source-config.validation-error');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.requests.add(
      this.api
        .configure(this.device.organizationId, this.device.id, {
          assetId: value.assetId,
          expectedVersion: this.current()?.configurationVersion ?? 0,
          sourceId: value.sourceId.trim(),
          transport: value.transport,
          profileVersion: value.profileVersion,
          schemaVersion: 1,
          temperatureUnit: value.temperatureUnit,
          humidityUnit: '%RH',
          fields: { temperature: fields[0], humidity: fields[1], recordedAt: fields[2] },
          reason: value.reason.trim(),
        })
        .subscribe({
          next: (configuration) => {
            this.current.set(configuration);
            this.history.update((rows) => [configuration, ...rows]);
            this.saving.set(false);
            this.editing.set(false);
            this.success.set(true);
            this.saved.emit();
          },
          error: (error: HttpErrorResponse) => {
            this.saving.set(false);
            this.error.set(
              error.status === 409
                ? 'source-config.conflict'
                : error.status === 403
                  ? 'source-config.forbidden'
                  : 'source-config.save-error',
            );
          },
        }),
    );
  }

  assetName(id: number): string {
    return this.assets.find((asset) => asset.id === id)?.name ?? String(id);
  }
}
