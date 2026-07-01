import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { IncidentDay } from '../../../domain/model/incident-day.entity';

Chart.register(...registerables);

/**
 * @summary Presents the incidents chart user interface in the monitoring bounded context.
 */
@Component({
  selector: 'app-incidents-chart',
  imports: [MatIconModule, TranslateModule],
  templateUrl: './incidents-chart.html',
  styleUrl: './incidents-chart.css',
})
export class IncidentsChart implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvasElement') private canvas!: ElementRef<HTMLCanvasElement>;

  @Input() days: IncidentDay[] = [];
  @Input() timeline: IncidentDay[] = [];

  private chart?: Chart;

  get resolvedTotal(): number {
    return this.days.reduce((sum, day) => sum + day.normal, 0);
  }
  get warningTotal(): number {
    return this.days.reduce((sum, day) => sum + day.warning, 0);
  }
  get criticalTotal(): number {
    return this.days.reduce((sum, day) => sum + day.critical, 0);
  }
  get offlineTotal(): number {
    return this.days.reduce((sum, day) => sum + day.offline, 0);
  }
  get chartMax(): number {
    const maxStack = Math.max(
      ...this.days.map((day) => day.normal + day.warning + day.critical + day.offline),
      1,
    );

    return Math.max(10, Math.ceil(maxStack * 1.18));
  }

  get averageIncidents(): string {
    const total = this.days.reduce(
      (sum, day) => sum + day.normal + day.warning + day.critical + day.offline,
      0,
    );
    const average = total / Math.max(this.days.length, 1);
    return average.toFixed(1).replace('.0', '');
  }

  /**
   * @summary Initializes view-dependent rendering after the template is available.
   */
  ngAfterViewInit(): void {
    this.buildChart();
  }
  /**
   * @summary Refreshes rendered state when component inputs change.
   */
  ngOnChanges(): void {
    if (this.chart) {
      this.refreshChart();
    } else {
      this.buildChart();
    }
  }
  /**
   * @summary Releases component resources when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private refreshChart(): void {
    if (!this.chart) return;
    if (!this.days.length) {
      this.chart.destroy();
      this.chart = undefined;
      return;
    }
    this.chart.data.labels = this.days.map((day) => day.label);
    this.chart.data.datasets[0].data = this.days.map((day) => day.normal);
    this.chart.data.datasets[1].data = this.days.map((day) => day.warning);
    this.chart.data.datasets[2].data = this.days.map((day) => day.critical);
    this.chart.data.datasets[3].data = this.days.map((day) => day.offline);
    if (this.chart.options.scales?.['y']) {
      (this.chart.options.scales['y'] as { max?: number }).max = this.chartMax;
    }
    this.chart.update();
  }

  /**
   * @summary Calculates the chart bar height for one incident day.
   */
  microHeight(day: IncidentDay): number {
    const total = day.normal + day.warning + day.critical + day.offline;
    return total > 0 ? Math.max(4, Math.min(36, total)) : 0;
  }

  private buildChart(): void {
    if (!this.canvas?.nativeElement) return;
    this.chart?.destroy();
    this.chart = undefined;

    if (!this.days.length) return;

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.days.map((day) => day.label),
        datasets: [
          {
            label: 'Resolved',
            data: this.days.map((day) => day.normal),
            backgroundColor: '#5bbf7f',
            borderRadius: 2,
            barPercentage: 0.42,
            categoryPercentage: 0.72,
            minBarLength: 3,
          },
          {
            label: 'Warning',
            data: this.days.map((day) => day.warning),
            backgroundColor: '#f2b646',
            borderRadius: 2,
            barPercentage: 0.42,
            categoryPercentage: 0.72,
            minBarLength: 3,
          },
          {
            label: 'Critical',
            data: this.days.map((day) => day.critical),
            backgroundColor: '#ed5145',
            borderRadius: 2,
            barPercentage: 0.42,
            categoryPercentage: 0.72,
            minBarLength: 4,
          },
          {
            label: 'Connectivity',
            data: this.days.map((day) => day.offline),
            backgroundColor: '#e8ecf2',
            borderRadius: 2,
            barPercentage: 0.42,
            categoryPercentage: 0.72,
            minBarLength: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(148,163,184,0.16)', drawTicks: false },
            border: { color: 'rgba(148,163,184,0.18)' },
            ticks: { color: '#AEB7C6', font: { family: 'Inter', size: 11, weight: '800' as any } },
          },
          y: {
            stacked: true,
            min: 0,
            max: this.chartMax,
            grid: { color: 'rgba(148,163,184,0.16)', drawTicks: false },
            border: { color: 'rgba(148,163,184,0.18)' },
            ticks: { display: false },
          },
        },
      },
    });
  }
}
