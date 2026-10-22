import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationComponent } from './notification.component';
import { NotificationService } from '../../services/notification.service';

describe('NotificationComponent', () => {
  let component: NotificationComponent;
  let fixture: ComponentFixture<NotificationComponent>;
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
    TestBed.configureTestingModule({
      declarations: [NotificationComponent],
      providers: [{ provide: NotificationService, useValue: service }]
    });

    fixture = TestBed.createComponent(NotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the notification component', () => {
    expect(component).toBeTruthy();
  });

  it('should display notifications emitted by NotificationService', () => {
    service.success('Request Submitted Successfully', 'Your request has been submitted successfully.');
    fixture.detectChanges();

    expect(component.notifications.length).toBe(1);
    expect(component.notifications[0].title).toBe('Request Submitted Successfully');
  });

  it('should dismiss notification when dismiss button clicked', () => {
    const id = service.error('Submission Failed', 'Network failure.');
    fixture.detectChanges();

    component.dismiss(id);
    fixture.detectChanges();

    expect(component.notifications.length).toBe(0);
  });
});
