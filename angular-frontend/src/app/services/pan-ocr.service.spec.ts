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
      legalName: null,
      businessName: 'ABC Industrial Supplies',
      address: '10, Sunrise Complex, Mg Road, Central Market, Pune, Maharashtra, 411001',
      city: 'Pune',
      pincode: '411001',
      state: 'Maharashtra',
    });
  });

  it('falls back to Legal Name when Trade Name is NA or missing', () => {
    const text = [
      'Registration Number: 07AABCS1429B1ZB',
      '1. Legal Name: ACME LOGISTICS PRIVATE LIMITED',
      '2. Trade Name, if any: NA',
      '3. Constitution of Business: Private Limited Company',
      'Address of Principal Place of Business',
      'Building No./Flat No.: 42',
      'Road/Street: Barakhamba Road',
      'City/Town/Village: New Delhi',
      'State: Delhi',
      'PIN Code: 110001',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.gstin).toBe('07AABCS1429B1ZB');
    expect(details.stateCode).toBe('07');
    expect(details.legalName).toBe('ACME LOGISTICS PRIVATE LIMITED');
    expect(details.businessName).toBe('ACME LOGISTICS PRIVATE LIMITED');
    expect(details.tradeName).toBe('ACME LOGISTICS PRIVATE LIMITED');
    expect(details.city).toBe('New Delhi');
    expect(details.pincode).toBe('110001');
  });

  it('corrects common OCR character confusions in GSTIN candidates', () => {
    const details = extractGstinDetailsFromText('Registration number: 27AAPFUO939F1ZV');

    expect(details.gstin).toBe('27AAPFU0939F1ZV');
    expect(details.stateCode).toBe('27');
  });
});
