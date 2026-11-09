import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: false,
  template: '<main class="home-page" aria-label="Home page"></main>',
  styles: [':host { display: block; flex: 1; } .home-page { min-height: 100%; }']
})
export class HomeComponent {}
