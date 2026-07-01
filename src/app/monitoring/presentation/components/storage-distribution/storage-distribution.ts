import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StorageDistributionItem } from '../../../domain/model/storage-distribution-item.entity';

Chart.register(...registerables);

/**
 * @summary Presents the thermal state distribution user interface in the monitoring bounded context.
 */
@Component({
  selector: 'app-storage-distribution',
  imports: [MatIconModule, TranslateModule],
  templateUrl: './storage-distribution.html',
  styleUrl: './storage-distribution.css'
})
export class StorageDistribution implements AfterViewInit, OnChanges, OnDestroy {
  private readonly translate = inject(TranslateService);
  @ViewChild('canvasElement') private canvas!: ElementRef<HTMLCanvasElement>;

  @Input() items: StorageDistributionItem[] = [];

  private chart?: Chart;

  /**
   * @summary Initializes view-dependent rendering after the template is available.
   */
  ngAfterViewInit(): void { this.buildChart(); }
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
  ngOnDestroy(): void { this.chart?.destroy(); }

  private refreshChart(): void {
    if (!this.chart) return;
    if (!this.items.length) {
      this.chart.destroy();
      this.chart = undefined;
      return;
    }
    this.chart.data.labels = this.items.map(item => this.translate.instant(item.label));
    this.chart.data.datasets[0].data = this.items.map(item => item.percentage);
    this.chart.data.datasets[0].backgroundColor = this.items.map(item => item.color);
    this.chart.update();
  }

  private buildChart(): void {
    if (!this.canvas?.nativeElement) return;
    this.chart?.destroy();
    this.chart = undefined;

    if (!this.items.length) return;

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: this.items.map(item => this.translate.instant(item.label)),
        datasets: [{
          data: this.items.map(item => item.percentage),
          backgroundColor: this.items.map(item => item.color),
          borderColor: '#ffffff',
          borderWidth: 7,
          borderRadius: 8,
          spacing: 0
        }]
      },
      options: { cutout: '50%', rotation: -84, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}
