import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { LayoutComponent } from './layout/layout.component';
import { DeleteRequestComponent } from './pages/delete-request/delete-request.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'signup', redirectTo: 'register' },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'register', pathMatch: 'full' },
      { path: 'register', component: CustomerRegistrationComponent },
      { path: 'verify', component: VerificationComponent },
      { path: 'delete-request', component: DeleteRequestComponent }
    ]
  },
  { path: '**', redirectTo: 'register' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule {}