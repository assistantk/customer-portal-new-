import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { LoginComponent } from './pages/login/login.component';
import { SignupComponent } from './pages/signup/signup.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { CustomerRegistrationComponent } from './pages/customer-registration/customer-registration.component';
import { GlobalCustomerCodeComponent } from './pages/global-customer-code/global-customer-code.component';
import { HandlingAgentCodeComponent } from './pages/handling-agent-code/handling-agent-code.component';
import { OwnershipCodeComponent } from './pages/ownership-code/ownership-code.component';
import { LayoutComponent } from './layout/layout.component';
import { NotificationComponent } from './components/notification/notification.component';
import { AuthInterceptor } from './services/auth.interceptor';

@NgModule({
  declarations: [
    App,
    LoginComponent,
    SignupComponent,
    VerificationComponent,
    CustomerRegistrationComponent,
    GlobalCustomerCodeComponent,
    HandlingAgentCodeComponent,
    OwnershipCodeComponent,
    LayoutComponent,
    NotificationComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [App]
})
export class AppModule {}