import { describe, it, expect, beforeEach } from 'vitest';
import { ZoneDivisionService } from './zone-division.service';

describe('ZoneDivisionService', () => {
  let service: ZoneDivisionService;

  beforeEach(() => {
    service = new ZoneDivisionService();
  });

  it('initializes with empty values and manuallyChanged = false', () => {
    expect(service.currentSelection).toEqual({
      zone: '',
      division: '',
      manuallyChanged: false
    });
  });

  it('sets default values without marking as manually changed', () => {
    service.setDefaultIfUnset('Northern Railway (NR)', 'Delhi (DLI)');
    expect(service.currentSelection).toEqual({
      zone: 'Northern Railway (NR)',
      division: 'Delhi (DLI)',
      manuallyChanged: false
    });
  });

  it('stores manual selection and marks manuallyChanged = true', () => {
    service.setSelection('Western Railway (WR)', 'Mumbai Central (BCT)', true);
    expect(service.currentSelection).toEqual({
      zone: 'Western Railway (WR)',
      division: 'Mumbai Central (BCT)',
      manuallyChanged: true
    });
  });

  it('does not overwrite manually selected values with setDefaultIfUnset', () => {
    service.setSelection('Western Railway (WR)', 'Mumbai Central (BCT)', true);
    service.setDefaultIfUnset('Northern Railway (NR)', 'Delhi (DLI)');
    expect(service.currentSelection).toEqual({
      zone: 'Western Railway (WR)',
      division: 'Mumbai Central (BCT)',
      manuallyChanged: true
    });
  });

  it('resets selection state', () => {
    service.setSelection('Western Railway (WR)', 'Mumbai Central (BCT)', true);
    service.reset();
    expect(service.currentSelection).toEqual({
      zone: '',
      division: '',
      manuallyChanged: false
    });
  });

  it('updates selection on login and clears on logout across multiple sessions', () => {
    // Session 1: Login with TKD
    service.setLoginDivision('Northern Railway (NR)', 'Tughlakabad / Delhi Area (TKD)');
    expect(service.currentSelection).toEqual({
      zone: 'Northern Railway (NR)',
      division: 'Tughlakabad / Delhi Area (TKD)',
      manuallyChanged: false
    });

    // Logout 1
    service.reset();
    expect(service.currentSelection).toEqual({
      zone: '',
      division: '',
      manuallyChanged: false
    });

    // Session 2: Login with DLI
    service.setLoginDivision('Northern Railway (NR)', 'Delhi (DLI)');
    expect(service.currentSelection).toEqual({
      zone: 'Northern Railway (NR)',
      division: 'Delhi (DLI)',
      manuallyChanged: false
    });

    // Logout 2
    service.reset();
    expect(service.currentSelection).toEqual({
      zone: '',
      division: '',
      manuallyChanged: false
    });

    // Session 3: Login with CSTM
    service.setLoginDivision('Central Railway (CR)', 'Mumbai CSMT (CSTM)');
    expect(service.currentSelection).toEqual({
      zone: 'Central Railway (CR)',
      division: 'Mumbai CSMT (CSTM)',
      manuallyChanged: false
    });
  });
});

