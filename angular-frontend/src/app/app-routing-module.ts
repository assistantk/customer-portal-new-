import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { GlobalCustomerCodeComponent } from './pages/global-customer-code/global-customer-code.component';
import { HandlingAgentCodeComponent } from './pages/handling-agent-code/handling-agent-code.component';
import { OwnershipCodeComponent } from './pages/ownership-code/ownership-code.component';
import { LayoutComponent } from './layout/layout.component';
import { AccessDeniedComponent } from './pages/access-denied/access-denied.component';
import { AuthGuard, SrDcmAccessGuard } from './services/auth.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'access-denied', component: AccessDeniedComponent },
  { path: 'signup', redirectTo: 'register' },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },
      { path: 'registration', component: CustomerRegistrationComponent, canActivate: [SrDcmAccessGuard] },
      { path: 'register', redirectTo: 'registration', pathMatch: 'full' },
      { path: 'registration/global-code', component: GlobalCustomerCodeComponent, canActivate: [SrDcmAccessGuard] },
      { path: 'register/global-code', redirectTo: 'registration/global-code', pathMatch: 'full' },
      { path: 'registration/handling-agent', component: HandlingAgentCodeComponent, canActivate: [SrDcmAccessGuard] },
      { path: 'registration/handling-agent-code', redirectTo: 'registration/handling-agent', pathMatch: 'full' },
      { path: 'register/handling-agent', redirectTo: 'registration/handling-agent', pathMatch: 'full' },
      { path: 'registration/ownership', component: OwnershipCodeComponent, canActivate: [SrDcmAccessGuard] },
      { path: 'registration/ownership-code', redirectTo: 'registration/ownership', pathMatch: 'full' },
      { path: 'register/ownership', redirectTo: 'registration/ownership', pathMatch: 'full' },
      { path: 'delete-request', component: CustomerRegistrationComponent, canActivate: [AuthGuard] },
      { path: 'verify', component: VerificationComponent, canActivate: [SrDcmAccessGuard] }
    ]
  },
  { path: '**', redirectTo: 'registration' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, onSameUrlNavigation: 'reload' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
