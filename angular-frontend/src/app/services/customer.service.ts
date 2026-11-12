import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, map, switchMap, catchError } from 'rxjs';
import { API_BASE_URL } from './api-config';

export interface MasterData {
  cities: Record<string, string[]>;
}

export interface GstinDuplicateRecord {
  recordType?: string;
  existingCode?: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  pincode?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  flaggedInconsistent?: boolean;
}

export interface GstinDuplicateCheckResult {
  duplicate: boolean;
  status: string;
  message: string;
  records: GstinDuplicateRecord[];
}

export interface PanGstinRecord {
  gstin?: string;
  address?: string;
  city?: string;
  pincode?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface PanCompanyRecord {
  recordType: string;
  codeType: string;
  companyCode: string;
  companyName: string;
  pan: string;
  primaryAddress?: string;
  city?: string;
  pincode?: string;
  gstins: PanGstinRecord[];
}

export interface PanDuplicateCheckResult {
  duplicate: boolean;
  status: string;
  message: string;
  companies: PanCompanyRecord[];
}

export interface GstinEntry {
  gstinId?: any;
  state: string;
  stateCode?: string;
  gstin: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  implementationDate?: string;
  persistedDetail?: boolean;
  file?: File | null;
  existingFileName?: string;
  scanning?: boolean;
  scanStatus?: 'idle' | 'processing' | 'success' | 'notfound' | 'error';
  scanError?: string;
  scanProgress?: string;
  registeredAddress?: string;
  city?: string;
  pincode?: string;
  gstinStatus?: string;
  addressStatus?: string;
  hasFile?: boolean;
  activeFlag?: string;
  dbVerificationStatus?: 'idle' | 'checking' | 'verified' | 'mismatch' | 'not_found' | 'unavailable';
  dbVerificationMessage?: string;
  dbVerifying?: boolean;
  dbVerifyReqId?: number;
  duplicateStatus?: 'idle' | 'checking' | 'available' | 'duplicate' | 'unavailable';
  duplicateMessage?: string;
  duplicateRecords?: GstinDuplicateRecord[];
  duplicateCheckReqId?: number;
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
  pcoCode?: string;
  ownershipCode?: string;
  ownershipAddress?: string;
  ownershipPartyCode?: string;
  ownershipPartyAddress?: string;
}

export interface GstinRemoval {
  gstin: string;
  effectiveFrom?: string;
}

export type DeleteRequestCodeType = 'GLOBAL_CUSTOMER' | 'HANDLING_AGENT';

export interface BackendImageOcrResponse {
  success: boolean;
  message?: string;
  tesseractMissing?: boolean;
  gstin?: string;
  tradeName?: string;
  legalName?: string;
  businessName?: string;
  pan?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  stateCode?: string;
  stateName?: string;
  pincode?: string;
  panMismatch?: boolean;
  companyNameTooLong?: boolean;
  rawText?: string;
}

export interface SemGstinVerificationResult {
  verified: boolean;
  status: 'VERIFIED' | 'MISMATCH' | 'NOT_FOUND' | 'UNAVAILABLE';
  message: string;
  gstin?: string;
  dbCompanyName?: string;
  dbAddress?: string;
  companyNameMatched?: boolean;
  addressMatched?: boolean;
}

export interface DeleteRequestVerification {
  success: boolean;
  found: boolean;
  code?: string;
  companyName?: string;
  record?: any;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly API = API_BASE_URL;

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
  lookupOldCustomerJDBC(code: string, searchMode: 'CODE' | 'NAME' = 'CODE'): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return this.http.get<any>(`${this.API}/customers/old-lookup`, {
      params: {
        code: trimmed,
        searchMode,
        searchType: searchMode === 'NAME' ? 'COMPANY_NAME' : 'CODE'
      },
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

  searchHandlingAgentsJDBC(query: string, searchMode: 'CODE' | 'NAME' = 'CODE'): Observable<any[]> {
    const trimmed = (query || '').trim().toUpperCase();
    return this.http.get<any[]>(`${this.API}/customers/agent-search`, {
      params: {
        query: trimmed,
        searchMode,
        searchType: searchMode === 'NAME' ? 'COMPANY_NAME' : 'CODE'
      },
      withCredentials: true
    });
  }

  searchOwnershipCodesJDBC(query: string, searchMode: 'CODE' | 'NAME' = 'CODE'): Observable<any[]> {
    const trimmed = (query || '').trim().toUpperCase();
    return this.http.get<any[]>(`${this.API}/customers/ownership-search`, {
      params: {
        query: trimmed,
        searchMode,
        searchType: searchMode === 'NAME' ? 'COMPANY_NAME' : 'CODE'
      },
      withCredentials: true
    });
  }

  verifyDeleteRequest(codeType: DeleteRequestCodeType, code: string): Observable<DeleteRequestVerification> {
    return this.http.post<DeleteRequestVerification>(
      `${this.API}/customers/delete-requests/verify`,
      { codeType, code },
      { withCredentials: true }
    );
  }

  submitDeleteRequest(codeType: DeleteRequestCodeType, code: string, companyName: string): Observable<any> {
    return this.http.post<any>(
      `${this.API}/customers/delete-requests/submit`,
      { codeType, code, companyName },
      { withCredentials: true }
    );
  }

  /* ---------- Direct Node Backend Customer Lookup ---------- */
  lookupCustomer(code: string): Observable<any> {
    const trimmed = (code || '').trim().toUpperCase();
    return forkJoin({
      custResp: this.http.get<any>(`${this.API}/customers/${encodeURIComponent(trimmed)}`, { withCredentials: true }),
      gstinResp: this.http.get<any>(`${this.API}/customers/${encodeURIComponent(trimmed)}/gstins`, { withCredentials: true })
    }).pipe(
      map(({ custResp, gstinResp }) => {
        const c = custResp?.data || custResp || {};
        const gstins = (gstinResp?.data || gstinResp || []).map((g: any) => ({
          gstinId: g.gstinId,
          state: g.state || '',
          stateCode: g.stateCode || '',
          gstin: g.gstinNumber || '',
          existingFileName: g.fileName || '',
          registeredAddress: g.registeredAddress || '',
          gstinStatus: g.gstinStatus || '',
          addressStatus: g.addressStatus || '',
          hasFile: g.hasFile || false,
          file: null,
          activeFlag: g.activeFlag || 'Y',
        }));

        return {
          customerCode: c.customerCode || '',
          companyName: c.customerName || '',
          address: c.address || '',
          city: c.city || '',
          pincode: c.pincode || '',
          pcoCode: c.pcoCode || '',
          panNumber: c.pan || '',
          panVerificationStatus: c.panVerificationStatus || '',
          email: c.email || '',
          mobile: c.mobile || '',
          globalCustomerCode: c.globalCustomerCode || '',
          handlingAgentCode: c.handlingAgentCode || '',
          activeFlag: c.activeFlag || 'Y',
          gstins,
        };
      })
    );
  }

  /* ---------- Code Generation (New User - Calls Backend API) ---------- */
  generateUniqueCode(companyName: string, codeType: string = 'GLOBAL'): Observable<string> {
    const type = codeType === 'HANDLING_AGENT' ? 'handling' : 'global';
    return this.http.post<any>(
      `${this.API}/customers/new-generate-code`,
      { companyName },
      {
        params: { type },
        withCredentials: true
      }
    ).pipe(
      map((resp) => resp?.code || resp?.data?.code || '')
    );
  }

  checkGstinDuplicate(gstin: string, currentCode?: string): Observable<GstinDuplicateCheckResult> {
    const clean = (gstin || '').trim().toUpperCase();
    let params: any = { gstin: clean };
    if (currentCode) {
      params.currentCode = currentCode;
    }
    return this.http.get<GstinDuplicateCheckResult>(`${this.API}/customers/check-gstin-duplicate`, {
      params,
      withCredentials: true
    }).pipe(
      catchError(() => of({
        duplicate: false,
        status: 'UNAVAILABLE',
        message: 'Duplicate Check Unavailable – Unable to verify this GSTIN.',
        records: []
      }))
    );
  }

  checkPanDuplicate(pan: string): Observable<PanDuplicateCheckResult> {
    const clean = (pan || '').trim().toUpperCase();
    return this.http.get<PanDuplicateCheckResult>(`${this.API}/customers/check-pan-duplicate`, {
      params: { pan: clean },
      withCredentials: true
    }).pipe(
      catchError(() => of({
        duplicate: false,
        status: 'UNAVAILABLE',
        message: 'Duplicate Check Unavailable – Unable to verify this PAN.',
        companies: []
      }))
    );
  }

  /* ---------- New Customer Registration (Triggers DBA Email via Spring Boot) ---------- */
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

    const gstinDetails = JSON.stringify(gstinEntries.map(g => ({
      gstin: g.gstin,
      state: g.state,
      address: g.registeredAddress || payload.address || '',
      city: g.city || payload.city || '',
      pincode: g.pincode || payload.pincode || ''
    })));
    formData.append('gstinDetails', gstinDetails);

    gstinEntries.forEach(entry => {
      if (entry.file) {
        formData.append('gstinFiles', entry.file);
      }
    });

    return this.http.post<any>(`${this.API}/customers/new-register`, formData, {
      withCredentials: true
    });
  }

  /* ---------- Update Existing Customer (Old User - Triggers DBA Email via Spring Boot) ---------- */
  updateOldCustomerJDBC(
    payload: CustomerPayload,
    gstinEntries: GstinEntry[],
    gstinRemovals: GstinRemoval[] = []
  ): Observable<any> {
    const gstinNumbers = gstinEntries
      .map(g => g.gstin)
      .filter(Boolean)
      .join(',');

    const gstinDetails = JSON.stringify(gstinEntries.map(g => ({
      gstin: g.gstin,
      state: g.state,
      address: g.registeredAddress || payload.address || '',
      city: g.city || payload.city || '',
      pincode: g.pincode || payload.pincode || ''
    })));

    const updateBody: any = {
      customerCode: payload.customerCode,
      companyName: payload.companyName,
      address: payload.address,
      city: payload.city || '',
      pincode: payload.pincode || '',
      operatingDivision: payload.operatingDivision || undefined,
      email: payload.email,
      mobile: payload.mobile,
      panNumber: payload.panNumber,
      gstinNumbers: gstinNumbers,
      codeType: payload.codeType || 'GLOBAL',
      gstinDetails: gstinDetails,
      gstinRemovals: JSON.stringify(gstinRemovals)
    };

    return this.http.post<any>(`${this.API}/customers/old-update`, updateBody, {
      withCredentials: true
    });
  }

  /* ---------- Node Backend Direct Update Customer ---------- */
  updateCustomer(code: string, payload: CustomerPayload, gstinEntries: GstinEntry[]): Observable<any> {
    const trimmedCode = code.trim().toUpperCase();
    const updateBody = {
      customerName: payload.companyName,
      address: payload.address,
      city: payload.city,
      pincode: payload.pincode,
      pcoCode: payload.pcoCode || undefined,
      pan: payload.panNumber,
      email: payload.email,
      mobile: payload.mobile,
      activeFlag: 'Y',
    };

    return this.http.put<any>(
      `${this.API}/customers/${encodeURIComponent(trimmedCode)}`,
      updateBody,
      { withCredentials: true }
    ).pipe(
      switchMap(() => {
        const fileUploads$: Observable<any>[] = [];
        for (const g of gstinEntries) {
          const fd = new FormData();
          fd.append('state', g.state);
          fd.append('stateCode', g.stateCode || '');
          fd.append('gstinNumber', g.gstin);
          fd.append('address', payload.address || '');
          if (g.file) {
            fd.append('gstinFile', g.file);
          }

          if (g.gstinId) {
            fileUploads$.push(
              this.http.put<any>(
                `${this.API}/customers/${encodeURIComponent(trimmedCode)}/gstins/${g.gstinId}`,
                fd,
                { withCredentials: true }
              )
            );
          } else {
            fileUploads$.push(
              this.http.post<any>(
                `${this.API}/customers/${encodeURIComponent(trimmedCode)}/gstins`,
                fd,
                { withCredentials: true }
              )
            );
          }
        }
        return fileUploads$.length > 0 ? forkJoin(fileUploads$) : of([]);
      }),
      map(() => ({ success: true, message: 'Customer updated successfully' }))
    );
  }

  /* ---------- Delete GSTIN (Node Backend) ---------- */
  deleteGstin(customerCode: string, gstinId: any): Observable<any> {
    return this.http.delete<any>(
      `${this.API}/customers/${encodeURIComponent(customerCode)}/gstins/${gstinId}`,
      { withCredentials: true }
    );
  }

  /* ---------- Legacy Ownership Customer Lookup & Update ---------- */
  lookupOwnershipCustomerJDBC(code: string): Observable<any> {
    return this.lookupOldCustomerJDBC(code);
  }

  updateOwnershipCustomerJDBC(payload: CustomerPayload): Observable<any> {
    const updateBody = {
      customerCode: payload.ownershipCode || payload.customerCode,
      companyName: payload.ownershipAddress || payload.companyName,
      address: payload.address,
      email: payload.email,
      mobile: payload.mobile,
      panNumber: payload.panNumber,
      gstinNumbers: '',
    };

    return this.http.post<any>(`${this.API}/customers/old-update`, updateBody, {
      withCredentials: true
    });
  }

  /* ---------- Ownership Section 1: Ownership Code ---------- */
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

  /* ---------- Ownership Section 1 & 2 Submit (Triggers DBA Email via Spring Boot) ---------- */
  submitOwnershipJDBC(ownershipCode: string, ownershipDesc: string, partyCode: string, partyDesc: string): Observable<any> {
    return this.http.post<any>(`${this.API}/customers/ownership-submit`, {
      ownershipCode,
      ownershipDesc,
      partyCode,
      partyDesc
    }, { withCredentials: true });
  }

  /* ---------- Ownership Section 2: Ownership Party Code ---------- */
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

  /* ---------- Image OCR (Backend Spring Boot Tesseract) ---------- */
  ocrImage(file: File): Observable<BackendImageOcrResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<BackendImageOcrResponse>(`${this.API}/customers/ocr-image`, formData, {
      withCredentials: true
    });
  }

  /* ---------- Office Database (SEM_GSTIN) Verification ---------- */
  verifySemGstin(gstin: string, companyName?: string, address?: string): Observable<SemGstinVerificationResult> {
    const params: Record<string, string> = { gstin: (gstin || '').trim().toUpperCase() };
    if (companyName?.trim()) params['companyName'] = companyName.trim();
    if (address?.trim()) params['address'] = address.trim();
    return this.http.get<SemGstinVerificationResult>(`${this.API}/customers/verify-sem-gstin`, {
      params,
      withCredentials: true
    }).pipe(
      catchError(() => of({
        verified: false,
        status: 'UNAVAILABLE' as const,
        message: 'ℹ Verification Unavailable – Unable to connect to office database.'
      }))
    );
  }
}