import { describe, expect, it } from 'vitest';
import { cleanAndShortenAddress, extractGstinDetailsFromText } from './pan-ocr.service';

describe('GSTIN OCR text extraction', () => {
  it('removes repeated place names while preserving their first spelling and order', () => {
    expect(cleanAndShortenAddress(
      'Paradip, Madhuban, Madhuban, Madhuban, Paradip, Jagatsinghapur, Odisha, 754142'
    )).toBe('Paradip, Madhuban, Jagatsinghapur, Odisha, 754142');
  });

  it('removes repeated words without changing legitimate place names or digits', () => {
    expect(cleanAndShortenAddress('JAGATSINGHAPUR, Plot Plot 12, Road Road No. 4, 754142'))
      .toBe('JAGATSINGHAPUR, Plot 12, Road No. 4, 754142');
  });

  it('cleans whitespace and punctuation without shortening addresses under the limit', () => {
    expect(cleanAndShortenAddress('  Address: 10,, Sunrise Complex\n  MG Road  '))
      .toBe('10, Sunrise Complex, MG Road');
  });

  it('shortens long addresses while preserving the house number, locality, and PIN code', () => {
    const address = cleanAndShortenAddress(
      'Building No 42, Sunrise Commercial Complex, Mahatma Gandhi Road, Industrial Area Phase Three, Near Central Railway Station, Pune, Maharashtra, 411001'
    );

    expect(address.length).toBeLessThanOrEqual(100);
    expect(address).toContain('Bldg No 42');
    expect(address).toContain('Industrial Area Phase Three');
    expect(address).toContain('411001');
    expect(address).not.toContain('Central Railway Station');
  });

  it('handles empty OCR results safely', () => {
    expect(cleanAndShortenAddress('')).toBe('');
    expect(cleanAndShortenAddress(null)).toBe('');
    expect(cleanAndShortenAddress(undefined)).toBe('');
  });

  it('uses the legal name and ignores additional trade name labels and null values', () => {
    const text = [
      'GSTIN: 21AAACJ1234D1Z5',
      '1. Legal Name: JINDAL PARADIP PORT LIMITED',
      '2. Trade Name, if any: JINDAL PARADIP PORT LIMITED',
      '3. Additional trade names, if any: null',
      'Address of Principal Place of Business',
      'Building No./Flat No.: 42',
      'Road/Street: Paradip Road',
      'City/Town/Village: Jagatsinghpur',
      'State: Odisha',
      'PIN Code: 754142',
    ].join('\n');

    expect(extractGstinDetailsFromText(text).businessName).toBe('JINDAL PARADIP PORT LIMITED');
    expect(extractGstinDetailsFromText(text).tradeName).toBe('JINDAL PARADIP PORT LIMITED');
  });

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
