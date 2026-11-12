import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewModalComponent } from './review-modal.component';

describe('ReviewModalComponent', () => {
  let component: ReviewModalComponent;

  beforeEach(() => {
    component = new ReviewModalComponent();
  });

  it('should initialize with default states', () => {
    expect(component.isOpen).toBe(false);
    expect(component.loading).toBe(false);
    expect(component.data).toBeNull();
  });

  it('should correctly evaluate helper getters based on operationType', () => {
    component.data = {
      operationType: 'NEW_ENTRY',
      title: 'Review New Entry',
      sectionName: 'Global Customer Code – New Entry'
    };
    expect(component.isNew).toBe(true);
    expect(component.isUpdate).toBe(false);
    expect(component.isDelete).toBe(false);
    expect(component.isOwnership).toBe(false);

    component.data.operationType = 'UPDATE_CODE';
    expect(component.isNew).toBe(false);
    expect(component.isUpdate).toBe(true);
    expect(component.isDelete).toBe(false);

    component.data.operationType = 'DELETE_REQUEST';
    expect(component.isDelete).toBe(true);

    component.data.operationType = 'OWNERSHIP_NEW';
    expect(component.isOwnership).toBe(true);
    expect(component.isNew).toBe(true);

    component.data.operationType = 'OWNERSHIP_UPDATE';
    expect(component.isOwnership).toBe(true);
    expect(component.isUpdate).toBe(true);
  });

  it('should emit confirm event when onConfirm is called and loading is false', () => {
    const emitSpy = vi.spyOn(component.confirm, 'emit');
    component.loading = false;
    component.onConfirm();
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('should not emit confirm event when onConfirm is called and loading is true (double-click protection)', () => {
    const emitSpy = vi.spyOn(component.confirm, 'emit');
    component.loading = true;
    component.onConfirm();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should emit cancel event when onCancel is called and loading is false', () => {
    const emitSpy = vi.spyOn(component.cancel, 'emit');
    component.loading = false;
    component.onCancel();
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('should not emit cancel event when onCancel is called and loading is true', () => {
    const emitSpy = vi.spyOn(component.cancel, 'emit');
    component.loading = true;
    component.onCancel();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
