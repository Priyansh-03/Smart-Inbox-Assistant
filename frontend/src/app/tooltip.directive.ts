import {
  Directive, ElementRef, HostListener, Input, OnDestroy, Renderer2,
} from '@angular/core';

// Hover/focus/tap tooltip. `[tip]="'text'"` on any element.
// Bubble is appended to <body> so overflow containers never clip it.
@Directive({ selector: '[tip]', standalone: true })
export class TooltipDirective implements OnDestroy {
  @Input('tip') text: string | null = null;

  private bubble?: HTMLElement;

  constructor(private host: ElementRef<HTMLElement>, private r: Renderer2) {}

  @HostListener('mouseenter') onEnter() { this.show(); }
  @HostListener('focus') onFocus() { this.show(); }
  @HostListener('mouseleave') onLeave() { this.hide(); }
  @HostListener('blur') onBlur() { this.hide(); }
  @HostListener('click') onClick() { this.toggle(); }      // tap support
  @HostListener('window:scroll') onScroll() { this.hide(); }
  @HostListener('document:keydown.escape') onEsc() { this.hide(); }

  ngOnDestroy() { this.hide(); }

  private toggle() { this.bubble ? this.hide() : this.show(); }

  private show() {
    if (this.bubble || !this.text) return;
    const el = this.r.createElement('div') as HTMLElement;
    el.className = 'tip-bubble';
    el.textContent = this.text;
    this.r.appendChild(document.body, el);
    this.bubble = el;

    const h = this.host.nativeElement.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    let top = h.top - b.height - 8;
    let below = false;
    if (top < 4) { top = h.bottom + 8; below = true; }
    let left = h.left + h.width / 2 - b.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - b.width - 8));

    el.style.top = `${Math.round(top + window.scrollY)}px`;
    el.style.left = `${Math.round(left + window.scrollX)}px`;
    el.classList.toggle('below', below);
    // arrow x offset relative to bubble
    el.style.setProperty('--tip-arrow', `${Math.round(h.left + h.width / 2 - left)}px`);
    requestAnimationFrame(() => el.classList.add('in'));
  }

  private hide() {
    if (!this.bubble) return;
    this.bubble.remove();
    this.bubble = undefined;
  }
}
