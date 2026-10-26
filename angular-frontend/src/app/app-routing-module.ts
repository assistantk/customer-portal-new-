import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { SignupComponent } from './pages/signup/signup.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard, NonAuthGuard } from './services/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [NonAuthGuard] },
  { path: 'signup', component: SignupComponent, canActivate: [NonAuthGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'register', pathMatch: 'full' },
      { path: 'register', component: CustomerRegistrationComponent },
      { path: 'verify', component: VerificationComponent }
    ]
  },
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule {}