import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, map } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { ExtractedGstinDetails } from './pan-ocr.service';

export interface GstVerificationResponse {
  success: boolean;
  gstin: string;
  legalName?: string;
  tradeName?: string;
  businessName?: string;
  pan?: string;
  status?: 'Active' | 'Cancelled' | 'Suspended' | string;
  registrationDate?: string;
  constitutionOfBusiness?: string;
  taxpayerType?: string;
  address?: string;
  city?: string;
  state?: string;
  district?: string;
  pincode?: string;
  natureOfBusiness?: string[];
  verificationStatus: 'VERIFIED' | 'CANCELLED' | 'SUSPENDED' | 'NOT_FOUND' | 'INVALID_GSTIN' | 'SERVICE_UNAVAILABLE' | 'ERROR';
  message?: string;
}

export type GstFieldStatus = 'match' | 'mismatch' | 'verified_only' | 'ocr_only';

export interface GstFieldComparison {
  field: 'gstin' | 'companyName' | 'pan' | 'address' | 'city' | 'pincode';
  label: string;
  ocrValue: string;
  verifiedValue: string;
  status: GstFieldStatus;
  autoCorrected: boolean;
  notes?: string;
}

export interface GstCrossCheckResult {
  gstin: string;
  verificationStatus: string;
  registrationStatus: string;
  hasDiscrepancies: boolean;
  discrepancyCount: number;
  matchCount: number;
  comparisons: GstFieldComparison[];
  verifiedData: GstVerificationResponse;
  ocrData: Partial<ExtractedGstinDetails>;
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

@Injectable({
  providedIn: 'root'
})
export class GstVerificationService {
  private readonly API = `${API_BASE_URL}/gst`;

  // In-memory cache for the current user session
  private cache = new Map<string, GstVerificationResponse>();

  constructor(private http: HttpClient) {}

  /**
   * Verifies a 15-character GSTIN against the backend authorized GST verification service.
   * Uses session cache to prevent duplicate calls for the same GSTIN during a single session.
   */
  verifyGstin(rawGstin: string): Observable<GstVerificationResponse> {
    if (!rawGstin) {
      return of({
        success: false,
        gstin: '',
        verificationStatus: 'INVALID_GSTIN',
        message: 'GSTIN is required.'
      });
    }

    const gstin = rawGstin.trim().toUpperCase();

    if (!GSTIN_REGEX.test(gstin)) {
      return of({
        success: false,
        gstin,
        verificationStatus: 'INVALID_GSTIN',
        message: 'Invalid 15-character GSTIN format.'
      });
    }

    // Check session cache first
    const cached = this.cache.get(gstin);
    if (cached?.success && ['VERIFIED', 'CANCELLED', 'SUSPENDED'].includes(cached.verificationStatus)) {
      return of(cached);
    }

    return this.http.get<GstVerificationResponse>(`${this.API}/verify/${gstin}`, { withCredentials: true }).pipe(
      map((res): GstVerificationResponse => {
        if (!res) {
          return {
            success: false,
            gstin,
            verificationStatus: 'SERVICE_UNAVAILABLE' as const,
            message: 'The authorized GST verification service returned no response.'
          };
        }
        if (res.gstin && res.gstin.trim().toUpperCase() !== gstin) {
          return {
            success: false,
            gstin,
            verificationStatus: 'ERROR' as const,
            message: 'The verification response did not match the requested GSTIN.'
          };
        }
        return res;
      }),
      tap((res) => {
        if (res.success && (res.verificationStatus === 'VERIFIED' || res.verificationStatus === 'CANCELLED' || res.verificationStatus === 'SUSPENDED')) {
          this.cache.set(gstin, res);
        }
      }),
      catchError((err): Observable<GstVerificationResponse> => {
        const errorBody: unknown = err?.error;
        if (errorBody && typeof errorBody === 'object' && 'verificationStatus' in errorBody) {
          const response = errorBody as Partial<GstVerificationResponse>;
          const status = response.verificationStatus;
          if (status === 'INVALID_GSTIN' || status === 'NOT_FOUND' || status === 'SERVICE_UNAVAILABLE' || status === 'ERROR') {
            return of({
              ...response,
              success: response.success === true,
              gstin: response.gstin || gstin,
              verificationStatus: status
            });
          }
        }
        return of<GstVerificationResponse>({
          success: false,
          gstin,
          verificationStatus: 'SERVICE_UNAVAILABLE',
          message: err?.error?.message || 'The authorized GST verification service is unavailable. Please retry.'
        });
      })
    );
  }

  /**
   * Clears the in-memory verification cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Performs an intelligent, field-by-field cross-verification between
   * OCR-extracted certificate information and authorized GST registry data.
   */
  compareOcrAndVerified(
    ocr: Partial<ExtractedGstinDetails>,
    verified: GstVerificationResponse
  ): GstCrossCheckResult {
    const comparisons: GstFieldComparison[] = [];
    let discrepancyCount = 0;
    let matchCount = 0;

    // 1. GSTIN Comparison
    const ocrGstin = this.normalizeToken(ocr.gstin);
    const verifiedGstin = this.normalizeToken(verified.gstin);
    const gstinMatch = ocrGstin && verifiedGstin ? ocrGstin === verifiedGstin : false;
    comparisons.push({
      field: 'gstin',
      label: 'GSTIN',
      ocrValue: ocr.gstin || '',
      verifiedValue: verified.gstin || '',
      status: gstinMatch ? 'match' : (ocrGstin ? 'mismatch' : 'verified_only'),
      autoCorrected: false,
      notes: gstinMatch ? 'Matches Certificate' : 'Mismatch detected'
    });
    if (gstinMatch) matchCount++;
    else if (ocrGstin) discrepancyCount++;

    // 2. Company / Business Name Comparison
    const ocrCompany = ocr.businessName || ocr.tradeName || ocr.legalName || '';
    const verifiedCompany = verified.businessName || verified.tradeName || verified.legalName || '';
    const companyMatch = this.namesMatchIntelligently(ocrCompany, verified);
    const hasOcrCompany = Boolean(ocrCompany.trim());
    const hasVerifiedCompany = Boolean(verifiedCompany.trim());

    let companyStatus: GstFieldStatus = 'match';
    let companyCorrected = false;
    let companyNotes = '';

    if (hasOcrCompany && hasVerifiedCompany) {
      if (companyMatch) {
        companyStatus = 'match';
        matchCount++;
        companyNotes = 'Normalized name matches';
      } else {
        companyStatus = 'mismatch';
        companyCorrected = true;
        discrepancyCount++;
        companyNotes = 'Corrected to authorized trade/legal name';
      }
    } else if (hasVerifiedCompany) {
      companyStatus = 'verified_only';
      companyCorrected = true;
      companyNotes = 'Populated from GST Registry';
    } else if (hasOcrCompany) {
      companyStatus = 'ocr_only';
      companyNotes = 'Extracted from PDF only';
    }

    comparisons.push({
      field: 'companyName',
      label: 'Company Name',
      ocrValue: ocrCompany,
      verifiedValue: verifiedCompany,
      status: companyStatus,
      autoCorrected: companyCorrected,
      notes: companyNotes
    });

    // 3. PAN Comparison
    const ocrPan = this.normalizeToken(ocr.pan);
    const verifiedPan = this.normalizeToken(verified.pan);
    const hasOcrPan = Boolean(ocrPan);
    const hasVerifiedPan = Boolean(verifiedPan);

    let panStatus: GstFieldStatus = 'match';
    let panCorrected = false;
    let panNotes = '';

    if (hasOcrPan && hasVerifiedPan) {
      if (ocrPan === verifiedPan) {
        panStatus = 'match';
        matchCount++;
        panNotes = 'Matches PAN on certificate';
      } else {
        panStatus = 'mismatch';
        panCorrected = true;
        discrepancyCount++;
        panNotes = 'Certificate PAN differs from GST-linked PAN';
      }
    } else if (hasVerifiedPan) {
      panStatus = 'verified_only';
      panCorrected = true;
      panNotes = 'Populated from GST Registry';
    } else if (hasOcrPan) {
      panStatus = 'ocr_only';
    }

    comparisons.push({
      field: 'pan',
      label: 'PAN Number',
      ocrValue: ocr.pan || '',
      verifiedValue: verified.pan || '',
      status: panStatus,
      autoCorrected: panCorrected,
      notes: panNotes
    });

    // 4. Address Comparison
    const ocrAddress = ocr.address || '';
    const verifiedAddress = verified.address || '';
    const hasOcrAddress = Boolean(ocrAddress.trim());
    const hasVerifiedAddress = Boolean(verifiedAddress.trim());

    let addressStatus: GstFieldStatus = 'match';
    let addressCorrected = false;
    let addressNotes = '';

    if (hasOcrAddress && hasVerifiedAddress) {
      const addrMatch = this.addressesMatchIntelligently(ocrAddress, verifiedAddress);
      if (addrMatch) {
        addressStatus = 'match';
        matchCount++;
        addressNotes = 'Address matches';
      } else {
        addressStatus = 'mismatch';
        addressCorrected = true;
        discrepancyCount++;
        addressNotes = 'Corrected to registered principal address';
      }
    } else if (hasVerifiedAddress) {
      addressStatus = 'verified_only';
      addressCorrected = true;
      addressNotes = 'Populated from GST Registry';
    } else if (hasOcrAddress) {
      addressStatus = 'ocr_only';
    }

    comparisons.push({
      field: 'address',
      label: 'Address',
      ocrValue: ocrAddress,
      verifiedValue: verifiedAddress,
      status: addressStatus,
      autoCorrected: addressCorrected,
      notes: addressNotes
    });

    // 5. PIN Code Comparison
    const ocrPin = this.normalizeToken(ocr.pincode);
    const verifiedPin = this.normalizeToken(verified.pincode);
    const hasOcrPin = Boolean(ocrPin);
    const hasVerifiedPin = Boolean(verifiedPin);

    let pinStatus: GstFieldStatus = 'match';
    let pinCorrected = false;
    let pinNotes = '';

    if (hasOcrPin && hasVerifiedPin) {
      if (ocrPin === verifiedPin) {
        pinStatus = 'match';
        matchCount++;
        pinNotes = 'PIN matches';
      } else {
        pinStatus = 'mismatch';
        pinCorrected = true;
        discrepancyCount++;
        pinNotes = 'PIN mismatch with registered place of business';
      }
    } else if (hasVerifiedPin) {
      pinStatus = 'verified_only';
      pinCorrected = true;
    } else if (hasOcrPin) {
      pinStatus = 'ocr_only';
    }

    comparisons.push({
      field: 'pincode',
      label: 'PIN Code',
      ocrValue: ocr.pincode || '',
      verifiedValue: verified.pincode || '',
      status: pinStatus,
      autoCorrected: pinCorrected,
      notes: pinNotes
    });

    // 6. City Comparison (if available)
    if (ocr.city || verified.city) {
      const ocrCity = this.normalizeToken(ocr.city);
      const verifiedCity = this.normalizeToken(verified.city);
      const cityMatch = Boolean(ocrCity && verifiedCity && (ocrCity.includes(verifiedCity) || verifiedCity.includes(ocrCity)));
      comparisons.push({
        field: 'city',
        label: 'City',
        ocrValue: ocr.city || '',
        verifiedValue: verified.city || '',
        status: cityMatch ? 'match' : (ocrCity && verifiedCity ? 'mismatch' : 'verified_only'),
        autoCorrected: Boolean(!cityMatch && verified.city),
        notes: cityMatch ? 'City matches' : 'Updated from GST'
      });
      if (cityMatch) matchCount++;
      else if (ocrCity && verifiedCity) discrepancyCount++;
    }

    const hasDiscrepancies = discrepancyCount > 0;

    return {
      gstin: verified.gstin,
      verificationStatus: verified.verificationStatus,
      registrationStatus: verified.status || 'Active',
      hasDiscrepancies,
      discrepancyCount,
      matchCount,
      comparisons,
      verifiedData: verified,
      ocrData: ocr
    };
  }

  /**
   * Intelligently compares two company names:
   * - Normalizes common legal suffixes: "PVT LTD" <-> "PRIVATE LIMITED", "LTD" <-> "LIMITED"
   * - Case-insensitive, ignores punctuation and excess whitespace
   * - Tests against both legalName and tradeName
   */
  namesMatchIntelligently(ocrName: string, verified: GstVerificationResponse): boolean {
    if (!ocrName || !ocrName.trim()) return false;
    const cleanOcr = this.canonicalizeCompanyName(ocrName);

    const candidates = [
      verified.tradeName,
      verified.legalName,
      verified.businessName
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      const cleanCandidate = this.canonicalizeCompanyName(c);
      if (cleanOcr === cleanCandidate) return true;
      // Also match if one contains the other and length ratio > 0.7
      if (cleanOcr.includes(cleanCandidate) || cleanCandidate.includes(cleanOcr)) {
        const minLen = Math.min(cleanOcr.length, cleanCandidate.length);
        const maxLen = Math.max(cleanOcr.length, cleanCandidate.length);
        if (minLen / maxLen >= 0.7) return true;
      }
    }
    return false;
  }

  /**
   * Intelligently compares addresses:
   * - Normalizes common terms: "ROAD" <-> "RD", "STREET" <-> "ST", "FLOOR" <-> "FLR", etc.
   * - Removes punctuation, trims whitespace, case-insensitive.
   */
  addressesMatchIntelligently(addr1: string, addr2: string): boolean {
    if (!addr1 || !addr2) return false;
    const c1 = this.canonicalizeAddress(addr1);
    const c2 = this.canonicalizeAddress(addr2);
    if (c1 === c2) return true;
    if (c1.includes(c2) || c2.includes(c1)) {
      const minLen = Math.min(c1.length, c2.length);
      const maxLen = Math.max(c1.length, c2.length);
      if (minLen / maxLen >= 0.7) return true;
    }
    return false;
  }

  private normalizeToken(val: string | null | undefined): string {
    return (val || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  }

  private canonicalizeCompanyName(name: string): string {
    return (name || '')
      .toUpperCase()
      .replace(/PRIVATE\s+LIMITED/g, 'PVT LTD')
      .replace(/PRIVATE\s+LTD/g, 'PVT LTD')
      .replace(/LIMITED/g, 'LTD')
      .replace(/CORPORATION/g, 'CORP')
      .replace(/SERVICES/g, 'SRVC')
      .replace(/LOGISTICS/g, 'LOGIX')
      .replace(/[^A-Z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private canonicalizeAddress(addr: string): string {
    return (addr || '')
      .toUpperCase()
      .replace(/ROAD/g, 'RD')
      .replace(/STREET/g, 'ST')
      .replace(/FLOOR/g, 'FLR')
      .replace(/BUILDING/g, 'BLDG')
      .replace(/NEAR/g, 'NR')
      .replace(/OPPOSITE/g, 'OPP')
      .replace(/INDUSTRIAL\s+AREA/g, 'IND AREA')
      .replace(/PHASE/g, 'PH')
      .replace(/SECTOR/g, 'SEC')
      .replace(/[^A-Z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
