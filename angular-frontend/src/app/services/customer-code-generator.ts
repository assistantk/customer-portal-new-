export function generateCustomerCode(companyName: string): string {
  if (!companyName?.trim()) return '';
  const words = companyName.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const cleanedName = companyName.replace(/[^A-Za-z]/g, '').toUpperCase() || 'CUST';
  const baseCode = words.length >= 4
    ? words.slice(0, 4).map(word => word[0]).join('').toUpperCase()
    : cleanedName;
  return baseCode.slice(0, 4).padEnd(4, 'X');
}
