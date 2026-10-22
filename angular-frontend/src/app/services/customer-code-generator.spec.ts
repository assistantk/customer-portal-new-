import { generateCustomerCode } from './customer-code-generator';

describe('generateCustomerCode', () => {
  it('creates a local code from significant company-name words', () => {
    expect(generateCustomerCode('M/S ABC Industrial Supplies')).toBe('MSAI');
  });

  it('pads shorter names to the four-character customer-code format', () => {
    expect(generateCustomerCode('ABC')).toBe('ABCX');
  });

  it('returns an empty code for a blank name', () => {
    expect(generateCustomerCode('  ')).toBe('');
  });
});
