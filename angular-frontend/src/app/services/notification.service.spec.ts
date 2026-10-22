import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('should initialize with an empty list of notifications', () => {
    let list: any[] = [];
    service.notifications$.subscribe(n => list = n);
    expect(list.length).toBe(0);
  });

  it('should add a success notification', () => {
    service.success('Request Submitted Successfully', 'Your request has been submitted successfully.');
    let list: any[] = [];
    service.notifications$.subscribe(n => list = n);
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('success');
    expect(list[0].title).toBe('Request Submitted Successfully');
    expect(list[0].message).toContain('Your request has been submitted');
  });

  it('should add an error notification', () => {
    service.error('Submission Failed', 'Something went wrong.');
    let list: any[] = [];
    service.notifications$.subscribe(n => list = n);
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('error');
    expect(list[0].title).toBe('Submission Failed');
  });

  it('should dismiss a notification by id', () => {
    const id = service.success('Title', 'Message', 0);
    let list: any[] = [];
    service.notifications$.subscribe(n => list = n);
    expect(list.length).toBe(1);

    service.dismiss(id);
    expect(list.length).toBe(0);
  });

  it('should clear all notifications', () => {
    service.success('T1', 'M1', 0);
    service.error('T2', 'M2', 0);
    service.clear();
    let list: any[] = [];
    service.notifications$.subscribe(n => list = n);
    expect(list.length).toBe(0);
  });
});
