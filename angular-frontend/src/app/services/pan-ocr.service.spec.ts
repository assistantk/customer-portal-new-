import { extractGstinDetailsFromText } from './pan-ocr.service';

describe('GSTIN OCR text extraction', () => {
  it('extracts GSTIN, trade name, and principal address fields', () => {
    const text = [
      'GSTIN: 27AAPFU0939F1ZV',
      'Trade Name: ABC Industrial Supplies',
      'Address of Principal Place of Business',
      'Building No./Flat No.: 10',
      'Name Of Premises/Building: Sunrise Complex',
      'Road/Street: MG Road',
      'Locality/Sub Locality: Central Market',
      'City/Town/Village: Pune',
      'State: Maharashtra',
      'PIN Code: 411001',
      'Date of Validity: Permanent',
    ].join('\n');

    expect(extractGstinDetailsFromText(text)).toEqual({
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
      tradeName: 'ABC Industrial Supplies',
      address: '10, Sunrise Complex, Mg Road, Central Market, Pune, Maharashtra, 411001',
      city: 'Pune',
      pincode: '411001',
      state: 'Maharashtra',
    });
  });

  it('corrects common OCR character confusions in GSTIN candidates', () => {
    const details = extractGstinDetailsFromText('Registration number: 27AAPFUO939F1ZV');

    expect(details.gstin).toBe('27AAPFU0939F1ZV');
    expect(details.stateCode).toBe('27');
  });
});
