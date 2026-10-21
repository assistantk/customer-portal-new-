import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Dadra and Nagar Haveli and Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export function getStateNameFromGstinCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const clean = String(code).padStart(2, '0');
  return STATE_CODE_MAP[clean] || null;
}

const GSTIN_REGEX = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/;

export interface ExtractedGstinDetails {
  gstin?: string | null;
  stateCode?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  state?: string | null;
  tradeName?: string | null;
  stateName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PanOcrService {
  constructor(private http: HttpClient) {}

  async extractGstinFromFile(file: File): Promise<ExtractedGstinDetails> {
    let details: ExtractedGstinDetails = {};

    // 1. Try reading text directly if it is a text-based PDF or contains readable stream
    try {
      const buffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      const rawText = textDecoder.decode(buffer);

      const gstinMatch = rawText.match(GSTIN_REGEX);
      if (gstinMatch) {
        const foundGstin = gstinMatch[0];
        const stateCode = foundGstin.slice(0, 2);
        details.gstin = foundGstin;
        details.stateCode = stateCode;
        details.state = getStateNameFromGstinCode(stateCode);

        const pinMatch = rawText.match(PIN_PATTERN);
        if (pinMatch) {
          details.pincode = pinMatch[0];
        }
      }
    } catch {
      // Ignore array buffer read errors
    }

    // 2. Try the backend OCR scan API if available
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('file', file);

      const apiRes: any = await firstValueFrom(
        this.http.post<any>('/api/documents/gstin/scan', formData)
      );

      if (apiRes && (apiRes.success || apiRes.extractedNumber || apiRes.gstin)) {
        const gstinNum = apiRes.extractedNumber || apiRes.gstin || details.gstin;
        details = {
          gstin: gstinNum,
          stateCode: apiRes.stateCode || (gstinNum ? gstinNum.slice(0, 2) : details.stateCode),
          address: apiRes.address || details.address || null,
          city: apiRes.city || details.city || null,
          pincode: apiRes.pincode || details.pincode || null,
          state: apiRes.state || details.state || null,
          tradeName: apiRes.tradeName || details.tradeName || null,
        };
      }
    } catch {
      // Backend document scanning might not be running; fallback to extracted details
    }

    return {
      ...details,
      stateName: details.state || getStateNameFromGstinCode(details.stateCode)
    };
  }
}
