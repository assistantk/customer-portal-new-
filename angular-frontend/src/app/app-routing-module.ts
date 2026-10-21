import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { SignupComponent } from './pages/signup/signup.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard, NonAuthGuard } from './services/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'register', pathMatch: 'full' },
      { path: 'register', component: CustomerRegistrationComponent },
      { path: 'verify', component: VerificationComponent }
    ]
  },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: '**', redirectTo: 'register' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}