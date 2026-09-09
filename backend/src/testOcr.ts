import assert from 'node:assert';
import {
  correctPanOcr,
  correctGstinOcr,
  isValidPAN,
  isValidGSTIN,
  isGstinMatchingPan,
  getStateNameFromCode,
  ALLOWED_GSTIN_FILE_TYPES,
} from './utils/validators.js';

console.log('🧪 Starting OCR & Extraction Unit and Integration Test Suite...');

// 1. PAN: Valid PAN extraction
const validPan = correctPanOcr('ABCDE1234F');
assert.strictEqual(validPan, 'ABCDE1234F', 'Valid PAN should be extracted as ABCDE1234F');
assert.strictEqual(isValidPAN('ABCDE1234F'), true, 'isValidPAN should return true for ABCDE1234F');
console.log('✓ Test 1 Passed: Valid PAN extraction');

// 2. PAN: Invalid PAN format
const invalidPan = correctPanOcr('12345ABCDE');
assert.strictEqual(invalidPan, null, 'Invalid PAN format should return null');
assert.strictEqual(isValidPAN('INVALIDPAN'), false, 'isValidPAN should return false for INVALIDPAN');
console.log('✓ Test 2 Passed: Invalid PAN handling');

// 3. PAN: OCR with lowercase text
const lowercasePan = correctPanOcr('abcde1234f');
assert.strictEqual(lowercasePan, 'ABCDE1234F', 'Lowercase PAN should be normalized to uppercase ABCDE1234F');
console.log('✓ Test 3 Passed: OCR with lowercase text');

// 4. PAN: OCR with spaces and OCR noise correction (e.g. '0' -> 'O', '1' -> 'I')
const spacedPan = correctPanOcr('  A B C D E 1 2 3 4 F  ');
assert.strictEqual(spacedPan, 'ABCDE1234F', 'PAN with spaces should be cleaned');

// Positional OCR misread correction test (e.g., '0BCDE1234F' -> 'OBCDE1234F')
const misreadPan = correctPanOcr('0BCDE1234F');
assert.strictEqual(misreadPan, 'OBCDE1234F', 'Digit 0 in position 0 should be corrected to letter O');
console.log('✓ Test 4 Passed: OCR with spaces and OCR noise correction');

// 5. PAN: OCR failure
const failedPan = correctPanOcr('NOT_A_PAN_TEXT');
assert.strictEqual(failedPan, null, 'OCR failure should return null');
console.log('✓ Test 5 Passed: OCR failure handling');

// 6. GSTIN: Valid GSTIN extraction & state code derivation
const validGstin = correctGstinOcr('07ABCDE1234F1Z5');
assert.strictEqual(validGstin, '07ABCDE1234F1Z5', 'Valid GSTIN should be extracted');
assert.strictEqual(isValidGSTIN('07ABCDE1234F1Z5'), true, 'isValidGSTIN should return true');
const stateCode = validGstin ? validGstin.slice(0, 2) : '';
assert.strictEqual(stateCode, '07', 'State code should be 07');
assert.strictEqual(getStateNameFromCode('07'), 'Delhi', 'State code 07 should map to Delhi');
console.log('✓ Test 6 Passed: Valid GSTIN extraction and State code auto-detection');

// 7. GSTIN: Embedded PAN extraction and consistency check
const embeddedPan = validGstin ? validGstin.slice(2, 12) : '';
assert.strictEqual(embeddedPan, 'ABCDE1234F', 'Embedded PAN in GSTIN 07ABCDE1234F1Z5 should be ABCDE1234F');
assert.strictEqual(isGstinMatchingPan('07ABCDE1234F1Z5', 'ABCDE1234F'), true, 'GSTIN should match PAN');
assert.strictEqual(isGstinMatchingPan('07ABCDE1234F1Z5', 'XYZDE9999F'), false, 'Mismatched PAN should return false');
console.log('✓ Test 7 Passed: GSTIN embedded PAN matching check');

// 8. GSTIN: OCR character correction (e.g., 'O' -> '0' in state code, '2' -> 'Z' in 14th pos)
const misreadGstin = correctGstinOcr('O7ABCDE1234F125');
assert.strictEqual(misreadGstin, '07ABCDE1234F1Z5', 'Positional misreads O->0 and 2->Z in GSTIN should be corrected');
console.log('✓ Test 8 Passed: GSTIN positional OCR character correction');

// 9. File validation: Supported and unsupported file types
assert.strictEqual(ALLOWED_GSTIN_FILE_TYPES.includes('application/pdf'), true, 'PDF file type supported');
assert.strictEqual(ALLOWED_GSTIN_FILE_TYPES.includes('image/jpeg'), true, 'JPEG file type supported');
assert.strictEqual(ALLOWED_GSTIN_FILE_TYPES.includes('image/png'), true, 'PNG file type supported');
assert.strictEqual(ALLOWED_GSTIN_FILE_TYPES.includes('text/plain'), false, 'TXT file type should be rejected');
console.log('✓ Test 9 Passed: File type validation');

// 10. Multi-GSTIN isolation simulation
interface GstinRowState {
  id: number;
  gstin: string;
  state: string;
}
const gstinRows: GstinRowState[] = [
  { id: 1, gstin: '07ABCDE1234F1Z5', state: 'Delhi' },
  { id: 2, gstin: '27XYZDE9999F1Z2', state: 'Maharashtra' },
];
// Updating row 2
const updatedRow2Gstin = '27ABCDE1234F1Z9';
const newRows = gstinRows.map(row => row.id === 2 ? { ...row, gstin: updatedRow2Gstin } : row);

assert.strictEqual(newRows[0].gstin, '07ABCDE1234F1Z5', 'GSTIN Row 1 must remain unchanged when updating Row 2');
assert.strictEqual(newRows[1].gstin, '27ABCDE1234F1Z9', 'GSTIN Row 2 should update independently');
console.log('✓ Test 10 Passed: Multi-GSTIN state isolation');

console.log('\n🎉 ALL OCR AND EXTRACTION TESTS PASSED SUCCESSFULLY!');
