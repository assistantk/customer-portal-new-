import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

export interface MasterData {
  cities: Record<string, string[]>;
}

export interface GstinEntry {
  gstinId?: any;
  state: string;
  stateCode?: string;
  gstin: string;
  file?: File | null;
  existingFileName?: string;
  scanning?: boolean;
  scanStatus?: 'idle' | 'processing' | 'success' | 'notfound' | 'error';
  scanError?: string;
}

export interface CustomerPayload {
  companyName: string;
  customerCode: string;
  address: string;
  city: string;
  pincode: string;
  panNumber: string;
  operatingDivision?: string;
  zone?: string;
  email?: string;
  mobile?: string;
  codeType?: string;
  ownershipCode?: string;
  ownershipAddress?: string;
  ownershipPartyCode?: string;
  ownershipPartyAddress?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly API = '/api';

  constructor(private http: HttpClient) {}

  /* ---------- Master Data ---------- */
  getMasterData(): Observable<MasterData> {
    return of({
      cities: {
        Delhi: ['110001', '110002'],
        Mumbai: ['400001', '400002'],
        Kolkata: ['700001', '700002'],
        Chennai: ['600001', '600002'],
        Noida: ['201301', '201303'],
        Bengaluru: ['560001', '560100'],
        Jaipur: ['302001', '302020'],
      }
    });
  }

  /* ---------- Customer Lookup (Old User) ---------- */
  lookupOldCustomerJDBC(code: string): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/old-lookup`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  lookupCustomerByGstinJDBC(gstin: string): Observable<any> {
    const trimmed = (gstin || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/gstin-lookup`, {
      params: { gstin: trimmed },
      withCredentials: true
    });
  }

  lookupHandlingAgentJDBC(code: string): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/agent-lookup`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  /* ---------- Code Generation (New User) ---------- */
  generateUniqueCode(companyName: string, codeType = 'GLOBAL'): Observable<string> {
    const type = codeType === 'HANDLING_AGENT' ? 'handling' : 'global';
    return this.http.post<any>(
      `${this.API}/customers/new-generate-code?type=${type}`,
      { companyName },
      { withCredentials: true }
    ).pipe(
      map(resp => resp?.data?.code || resp?.code || '')
    );
  }

  /* ---------- New Customer Registration ---------- */
  registerCustomer(payload: CustomerPayload, gstinEntries: GstinEntry[]): Observable<any> {
    const codeType = payload.codeType === 'HANDLING_AGENT' ? 'handling' : 'global';
    const formData = new FormData();
    formData.append('codeType', codeType);
    formData.append('customerCode', payload.customerCode || '');
    formData.append('companyName', payload.companyName || '');
    formData.append('address', payload.address || '');
    formData.append('city', payload.city || '');
    formData.append('pincode', payload.pincode || '');
    formData.append('panNumber', payload.panNumber || '');
    formData.append('email', payload.email || '');
    formData.append('mobile', payload.mobile || '');
    formData.append('operatingDivision', payload.operatingDivision || '');
    formData.append('zone', payload.zone || '');

    const gstinNumbers = gstinEntries.map(g => g.gstin).filter(Boolean).join(',');
    formData.append('gstinNumbers', gstinNumbers);

    gstinEntries.forEach(entry => {
      if (entry.file) {
        formData.append('gstinFiles', entry.file);
      }
    });

    return this.http.post<any>(`${this.API}/customers/new-register`, formData, {
      withCredentials: true
    });
  }

  /* ---------- Update Existing Customer (Old User) ---------- */
  updateOldCustomerJDBC(payload: CustomerPayload, gstinEntries: GstinEntry[]): Observable<any> {
    const gstinNumbers = gstinEntries
      .map(g => g.gstin)
      .filter(Boolean)
      .join(',');

    const updateBody = {
      customerCode: payload.customerCode,
      companyName: payload.companyName,
      address: payload.address,
      city: payload.city || '',
      email: payload.email,
      mobile: payload.mobile,
      panNumber: payload.panNumber,
      gstinNumbers: gstinNumbers,
      codeType: payload.codeType || 'GLOBAL',
    };

    return this.http.post<any>(`${this.API}/customers/old-update`, updateBody, {
      withCredentials: true
    });
  }

  /* ---------- Ownership Section 1: MEMWGONOWNRSHIP ---------- */
  lookupOwnershipJDBC(code: string): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/ownership-lookup`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  checkOwnershipDuplicate(code: string): Observable<{ duplicate: boolean }> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<{ duplicate: boolean }>(`${this.API}/customers/ownership-check`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  saveOwnershipJDBC(ownershipCode: string, ownershipDesc: string): Observable<any> {
    return this.http.post<any>(`${this.API}/customers/ownership-save`, {
      ownershipCode,
      ownershipDesc
    }, { withCredentials: true });
  }

  submitOwnershipJDBC(ownershipCode: string, ownershipDesc: string, partyCode: string, partyDesc: string): Observable<any> {
    return this.http.post<any>(`${this.API}/customers/ownership-submit`, {
      ownershipCode,
      ownershipDesc,
      partyCode,
      partyDesc
    }, { withCredentials: true });
  }

  /* ---------- Ownership Section 2: MEMWGONOWNRPRTY ---------- */
  lookupOwnershipPartyJDBC(code: string): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/ownership-party-lookup`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  checkOwnershipPartyDuplicate(code: string): Observable<{ duplicate: boolean }> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<{ duplicate: boolean }>(`${this.API}/customers/ownership-party-check`, {
      params: { code: trimmed },
      withCredentials: true
    });
  }

  saveOwnershipPartyJDBC(partyCode: string, partyDesc: string): Observable<any> {
    return this.http.post<any>(`${this.API}/customers/ownership-party-save`, {
      partyCode,
      partyDesc
    }, { withCredentials: true });
  }
}