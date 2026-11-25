import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AssetSettings } from '../../../../asset-management/domain/model/asset-settings.entity';
import { Asset } from '../../../../asset-management/domain/model/asset.entity';
import { IoTDevice } from '../../../../asset-management/domain/model/iot-device.entity';
import { SensorReading } from '../../../domain/model/sensor-reading.entity';
import { TemperaturePoint } from '../../../domain/model/temperature-point.entity';
import { TemperatureGauge } from '../temperature-gauge/temperature-gauge';
import { TemperatureChart } from '../temperature-chart/temperature-chart';

/**
 * @summary Presents the monitoring asset card user interface in the monitoring bounded context.
 */
@Component({
  selector: 'app-monitoring-asset-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, TemperatureGauge, TemperatureChart],
  templateUrl: './monitoring-asset-card.html',
  styleUrl: './monitoring-asset-card.css',
})
export class MonitoringAssetCard {
  @Input() telemetryState: string | null = null;
  @Input() safeRange?: { minTemperature: number; maxTemperature: number };
  @Input() asset!: Asset;
  @Input() device: IoTDevice | null = null;
  @Input() location = 'N/A';
  @Input() latestReading: SensorReading | null = null;
  @Input() settings: AssetSettings | undefined;
  @Input() chartPoints: TemperaturePoint[] = [];

  get temperature(): number | null {
    return this.telemetryState !== null
      ? (this.latestReading?.temperature ?? null)
      : (this.latestReading?.temperature ?? this.parseAssetTemperature());
  }

  get humidity(): number | null {
    return this.latestReading?.humidity ?? null;
  }

  get sensorId(): string {
    return this.device?.uuid ?? 'N/A';
  }

  get lastReadingTime(): string {
    if (!this.latestReading) {
      return 'N/A';
    }

    return new Date(this.latestReading.recordedAt).toLocaleString([], {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
    });
  }

  get minimumTemperature(): number | null {
    return this.safeRange?.minTemperature ?? this.settings?.minimumTemperature ?? null;
  }

  get maximumTemperature(): number | null {
    return this.safeRange?.maxTemperature ?? this.settings?.maximumTemperature ?? null;
  }

  get hasIncident(): boolean {
    if (this.telemetryState !== null) return this.telemetryState === 'OUT_OF_RANGE';
    return this.latestReading?.isOutOfRange === true || this.hasAssetIncident();
  }

  get statusKey(): string {
    if (this.telemetryState !== null) return `increment.states.${this.telemetryState}`;
    if (!this.latestReading) {
      return 'monitoring.asset-monitoring.status.no-data';
    }

    return this.hasIncident
      ? 'monitoring.operational.status-out-of-range'
      : 'monitoring.operational.status-in-range';
  }

  get incidentTypeKey(): string {
    if (this.latestReading?.isOutOfRange) {
      return 'monitoring.asset-monitoring.incident.out-of-range';
    }

    return this.asset.lastIncident;
  }

  get incidentValue(): string {
    const temperature = this.latestReading?.temperature;
    const humidity = this.latestReading?.humidity;

    if (temperature !== null && temperature !== undefined) {
      return `${temperature.toFixed(1)} °C`;
    }

    if (humidity !== null && humidity !== undefined) {
      return `${humidity}%`;
    }

    return this.asset.currentTemperature || 'N/A';
  }

  private hasAssetIncident(): boolean {
    return !!this.asset.lastIncident && !['none', 'None'].includes(this.asset.lastIncident);
  }

  private parseAssetTemperature(): number | null {
    const value = Number.parseFloat(this.asset.currentTemperature?.replace('°C', '') ?? '');

    return Number.isFinite(value) ? value : null;
  }
}
