import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { TranslateService } from '@ngx-translate/core';

/**
 * @summary Presents the language switcher user interface in the shared bounded context.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [
    MatButtonToggle,
    MatButtonToggleGroup
  ],
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css'
})
export class LanguageSwitcher {
  protected currentLang: string;
  protected languages: string[];
  protected menuOpen = false;
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private translate: TranslateService;

  constructor() {
    this.translate = inject(TranslateService);
    this.currentLang = this.translate.getCurrentLang() || 'en';
    this.languages = [...this.translate.getLangs()];

    this.translate.onLangChange.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.currentLang = event.lang;
    });
  }

  /**
   * @summary Changes the active application language.
   */
  useLanguage(language: string) {
    this.translate.use(language);
    this.currentLang = language;
    this.menuOpen = false;
  }

  protected toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  @HostListener('document:click', ['$event'])
  protected closeMenuOnOutsideClick(event: MouseEvent): void {
    if (!this.menuOpen) {
      return;
    }

    const target = event.target;

    if (target instanceof Node && this.elementRef.nativeElement.contains(target)) {
      return;
    }

    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  protected closeMenuOnEscape(): void {
    this.menuOpen = false;
  }

  protected flagFor(language: string): string {
    return `icons/flag-${language}.svg`;
  }

  protected labelFor(language: string): string {
    return language.toUpperCase();
  }
}
