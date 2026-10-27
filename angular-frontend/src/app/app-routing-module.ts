import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { GlobalCustomerCodeComponent } from './pages/global-customer-code/global-customer-code.component';
import { HandlingAgentCodeComponent } from './pages/handling-agent-code/handling-agent-code.component';
import { OwnershipCodeComponent } from './pages/ownership-code/ownership-code.component';
import { LayoutComponent } from './layout/layout.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'signup', redirectTo: 'register' },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'registration', pathMatch: 'full' },
      { path: 'registration', component: CustomerRegistrationComponent },
      { path: 'register', redirectTo: 'registration', pathMatch: 'full' },
      { path: 'registration/global-code', component: GlobalCustomerCodeComponent },
      { path: 'register/global-code', redirectTo: 'registration/global-code', pathMatch: 'full' },
      { path: 'registration/handling-agent', component: HandlingAgentCodeComponent },
      { path: 'registration/handling-agent-code', redirectTo: 'registration/handling-agent', pathMatch: 'full' },
      { path: 'register/handling-agent', redirectTo: 'registration/handling-agent', pathMatch: 'full' },
      { path: 'registration/ownership', component: OwnershipCodeComponent },
      { path: 'registration/ownership-code', redirectTo: 'registration/ownership', pathMatch: 'full' },
      { path: 'register/ownership', redirectTo: 'registration/ownership', pathMatch: 'full' },
      { path: 'verify', component: VerificationComponent }
    ]
  },
  { path: '**', redirectTo: 'registration' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }