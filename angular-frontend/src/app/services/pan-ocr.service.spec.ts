import { describe, expect, it } from 'vitest';
import { cleanAndShortenAddress, extractGstinDetailsFromText, combineMultiPageDetails } from './pan-ocr.service';

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
      pan: 'AAPFU0939F',
      panMismatch: false,
      companyNameTooLong: false,
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

  it('extracts explicit PAN field and validates against GSTIN', () => {
    const text = [
      'GSTIN: 27AAPFU0939F1ZV',
      'Permanent Account Number: AAPFU0939F',
      'Trade Name: Acme Exports',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.pan).toBe('AAPFU0939F');
    expect(details.panMismatch).toBe(false);
  });

  it('detects mismatch when explicit PAN does not match GSTIN', () => {
    const text = [
      'GSTIN: 27AAPFU0939F1ZV',
      'PAN: BBBPK9999Z',
      'Trade Name: Acme Exports',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.pan).toBe('BBBPK9999Z');
    expect(details.panMismatch).toBe(true);
  });

  it('flags companyNameTooLong when extracted name exceeds 40 characters', () => {
    const text = [
      'GSTIN: 27AAPFU0939F1ZV',
      'Trade Name: BHARAT HEAVY ELECTRICALS AND MECHANICAL LOGISTICS ENTERPRISES PRIVATE LIMITED',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.companyNameTooLong).toBe(true);
    expect(details.businessName).toBe('BHARAT HEAVY ELECTRICALS AND MECHANICAL LOGISTICS ENTERPRISES PRIVATE LIMITED');
  });

  it('prioritizes Trade Name over Legal Name and never concatenates them', () => {
    const text = [
      'GSTIN: 07AABCS1429B1ZB',
      '1. Legal Name: ACME HOLDINGS PRIVATE LIMITED',
      '2. Trade Name, if any: SPEEDY FREIGHT SERVICES',
      '3. Additional trade names, if any: null',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.businessName).toBe('SPEEDY FREIGHT SERVICES');
    expect(details.tradeName).toBe('SPEEDY FREIGHT SERVICES');
    expect(details.legalName).toBe('ACME HOLDINGS PRIVATE LIMITED');
    expect(details.businessName).not.toContain('ACME HOLDINGS');
  });

  it('extracts address components including Floor and Flat numbers without labels', () => {
    const text = [
      'GSTIN: 27AAPFU0939F1ZV',
      'Address of Principal Place of Business',
      'Flat No.: Flat 402',
      'Floor No.: 4th Floor',
      'Name Of Premises/Building: Fortune Towers',
      'Road/Street: Senapati Bapat Marg',
      'City/Town/Village: Mumbai',
      'District: Mumbai Suburban',
      'State: Maharashtra',
      'PIN Code: 400013',
    ].join('\n');

    const details = extractGstinDetailsFromText(text);
    expect(details.address).toContain('Flat 402');
    expect(details.address).toContain('4th Floor');
    expect(details.address).toContain('Fortune Towers');
    expect(details.address).not.toContain('Flat No.');
    expect(details.address).not.toContain('Floor No.');
    expect(details.city).toBe('Mumbai');
    expect(details.pincode).toBe('400013');
  });

  it('Test A: Rahul Carbon Commercials - extracts from scanned REG-06 certificate with wrapped table headers', () => {
    const p1Text = [
      'Government of India',
      'Form GST REG-06',
      '[See Rule 10(1)]',
      'Registration Certificate',
      'Registration Number : 20AAFCR6785B1ZK',
      '(1 Legal Name RAHUL CARBON COMMERCIALS PRIVATE LIMITED',
      'Trade Name, if any M/S RAHUL CARBON COMMERCIAL PVT. LTD.',
      'Constitution of Business Private Limited Company',
      '4. Address of Principal Place of 5TH FLOOR, 502, PANCHWATI PLAZA, KUTCHERY ROAD,',
      'Business RANCHI, Ranchi, Jharkhand, 834001',
      'Date of Liability 01/07/2017',
      'Type of Registration Regular',
      'Date of issue of Certificate 17/07/2018',
    ].join('\n');

    const details = extractGstinDetailsFromText(p1Text);
    expect(details.gstin).toBe('20AAFCR6785B1ZK');
    expect(details.businessName).toBe('M/S RAHUL CARBON COMMERCIAL PVT. LTD.');
    expect(details.tradeName).toBe('M/S RAHUL CARBON COMMERCIAL PVT. LTD.');
    expect(details.legalName).toBe('RAHUL CARBON COMMERCIALS PRIVATE LIMITED');
    expect(details.pan).toBe('AAFCR6785B');
    expect(details.city).toBe('Ranchi');
    expect(details.pincode).toBe('834001');
    expect(details.address).toContain('5th Floor');
    expect(details.address).toContain('502');
    expect(details.address).toContain('Panchwati Plaza');
    expect(details.address).toContain('Kutchery Road');
    expect(details.address).toContain('Ranchi');
    expect(details.address).toContain('Jharkhand');
    expect(details.address).toContain('834001');
    expect(details.address!.length).toBeLessThanOrEqual(100);
  });

  it('Test B: Bihar Agro - mixed PDF multi-page extraction ignores appointment letter and extracts REG-06', () => {
    const page1AppointmentLetter = [
      'MATIX FERTILISERS AND CHEMICALS LIMITED',
      'Date: 16th December, 2025',
      'Ref No: MFCL/BH/H&T/Dec-25/06',
      'M/s Bihar Agro',
      'Sathopur, Bihar Sharif (Nalanda)-803216',
      'Subject: Appointment letter as Matix Authorized H & T Contractor at Warisaliganj RH',
      'Dear Sir, We are pleased to inform you that you are appointed as Contractor...',
      'Corporate Office: Poonam Chambers, B Wing, 5th Floor, Dr A B Road, Worli, Mumbai 400 018',
      'Noida (UP) 201 301, India',
    ].join('\n');

    const page2GstReg06 = [
      'Government of India',
      'Form GST REG-06',
      '[See Rule 10(1)]',
      'Registration Certificate',
      'Registration Number : 10APTPP7274D2Z0O',
      '[1 [regal Name MAHESH PRASAD',
      '[2 [Trade Name, if any BIHAR AGRO',
      '3. {Additional trade names, if any',
      'Address of Principal Place of',
      'Business Building No./Flat No.: a 1',
      'Road/Street: fatwah',
      'Locality/Sub Locality: maujipur',
      'City/Town/Village: Fatwah',
      'District: Patna',
      'State: Bihar i',
      'PIN Code: 803201',
      'Date of Liability 01/07/2017',
      'Type of Registration - Regular',
    ].join('\n');

    const page3AnnexureA = [
      'Annexure A',
      'Goods and Services Tax Identification Number: 10APTPP7274D2Z0',
      'Details of Additional Place of Business(s)',
      'Legal Name MAHESH PRASAD',
      'Trade Name, if any BIHAR AGRO',
      'Total Number of Additional Places of Business(s) in the State 1',
      '1 sathopur, ekanger road, sathopur, Nalanda, Bihar, 803101',
    ].join('\n');

    const page4AnnexureB = [
      'Annexure B',
      'Goods and Services Tax Identification Number: 10APTPP7274D2Z0',
      'Legal Name MAHESH PRASAD',
      'Trade Name, if any BIHAR AGRO',
      'Details of Proprietor',
      '1 Name mahesh prasad',
      'Designation/Status owner',
      'Resident of State Bihar',
    ].join('\n');

    const combined = combineMultiPageDetails([
      { pageNumber: 1, text: page1AppointmentLetter },
      { pageNumber: 2, text: page2GstReg06 },
      { pageNumber: 3, text: page3AnnexureA },
      { pageNumber: 4, text: page4AnnexureB },
    ]);

    expect(combined.gstin).toBe('10APTPP7274D2ZO');
    expect(combined.businessName).toBe('BIHAR AGRO');
    expect(combined.tradeName).toBe('BIHAR AGRO');
    expect(combined.pan).toBe('APTPP7274D');
    expect(combined.city).toBe('Fatwah');
    expect(combined.pincode).toBe('803201');
    expect(combined.address).toContain('Fatwah');
    expect(combined.address).toContain('Maujipur');
    expect(combined.address).toContain('Bihar');
    expect(combined.address).toContain('803201');
    // Must NOT contain appointment letter addresses or Annexure A additional place addresses
    expect(combined.address).not.toContain('Mumbai');
    expect(combined.address).not.toContain('Poonam Chambers');
    expect(combined.address).not.toContain('Nalanda');
    expect(combined.address).not.toContain('400018');
    expect(combined.address).not.toContain('803216');
  });
});
