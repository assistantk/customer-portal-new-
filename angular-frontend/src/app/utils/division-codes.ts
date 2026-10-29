export interface DivisionInfo {
  code: string;
  name: string;
  zone: string;
}

export const RAILWAY_DIVISIONS: DivisionInfo[] = [
  // Central Railway (CR)
  { code: 'CSTM', name: 'Mumbai CSMT', zone: 'Central Railway (CR)' },
  { code: 'BSL', name: 'Bhusawal', zone: 'Central Railway (CR)' },
  { code: 'NGP', name: 'Nagpur (CR)', zone: 'Central Railway (CR)' },
  { code: 'PUNE', name: 'Pune', zone: 'Central Railway (CR)' },
  { code: 'SUR', name: 'Solapur', zone: 'Central Railway (CR)' },

  // Eastern Railway (ER)
  { code: 'HWH', name: 'Howrah', zone: 'Eastern Railway (ER)' },
  { code: 'SDAH', name: 'Sealdah', zone: 'Eastern Railway (ER)' },
  { code: 'ASN', name: 'Asansol', zone: 'Eastern Railway (ER)' },
  { code: 'MLDT', name: 'Malda', zone: 'Eastern Railway (ER)' },

  // East Central Railway (ECR)
  { code: 'DNR', name: 'Danapur', zone: 'East Central Railway (ECR)' },
  { code: 'DHN', name: 'Dhanbad', zone: 'East Central Railway (ECR)' },
  { code: 'DDU', name: 'Pt. Deen Dayal Upadhyaya', zone: 'East Central Railway (ECR)' },
  { code: 'SPJ', name: 'Samastipur', zone: 'East Central Railway (ECR)' },
  { code: 'SEE', name: 'Sonpur', zone: 'East Central Railway (ECR)' },

  // East Coast Railway (ECOR)
  { code: 'KUR', name: 'Khurda Road', zone: 'East Coast Railway (ECOR)' },
  { code: 'SBP', name: 'Sambalpur', zone: 'East Coast Railway (ECOR)' },
  { code: 'RGDA', name: 'Rayagada', zone: 'East Coast Railway (ECOR)' },

  // Northern Railway (NR)
  { code: 'DLI', name: 'Delhi', zone: 'Northern Railway (NR)' },
  { code: 'UMB', name: 'Ambala', zone: 'Northern Railway (NR)' },
  { code: 'FZR', name: 'Firozpur', zone: 'Northern Railway (NR)' },
  { code: 'LKO', name: 'Lucknow (NR)', zone: 'Northern Railway (NR)' },
  { code: 'MB', name: 'Moradabad', zone: 'Northern Railway (NR)' },
  { code: 'TKD', name: 'Tughlakabad / Delhi Area', zone: 'Northern Railway (NR)' },

  // North Central Railway (NCR)
  { code: 'PRYJ', name: 'Prayagraj', zone: 'North Central Railway (NCR)' },
  { code: 'AGC', name: 'Agra', zone: 'North Central Railway (NCR)' },
  { code: 'JHS', name: 'Jhansi', zone: 'North Central Railway (NCR)' },

  // North Eastern Railway (NER)
  { code: 'IZN', name: 'Izzatnagar', zone: 'North Eastern Railway (NER)' },
  { code: 'LJN', name: 'Lucknow (NER)', zone: 'North Eastern Railway (NER)' },
  { code: 'BSB', name: 'Varanasi', zone: 'North Eastern Railway (NER)' },

  // Northeast Frontier Railway (NFR)
  { code: 'APDJ', name: 'Alipurduar', zone: 'Northeast Frontier Railway (NFR)' },
  { code: 'KIR', name: 'Katihar', zone: 'Northeast Frontier Railway (NFR)' },
  { code: 'LMG', name: 'Lumding', zone: 'Northeast Frontier Railway (NFR)' },
  { code: 'RNY', name: 'Rangiya', zone: 'Northeast Frontier Railway (NFR)' },
  { code: 'TSK', name: 'Tinsukia', zone: 'Northeast Frontier Railway (NFR)' },

  // North Western Railway (NWR)
  { code: 'JP', name: 'Jaipur', zone: 'North Western Railway (NWR)' },
  { code: 'AII', name: 'Ajmer', zone: 'North Western Railway (NWR)' },
  { code: 'BKN', name: 'Bikaner', zone: 'North Western Railway (NWR)' },
  { code: 'JU', name: 'Jodhpur', zone: 'North Western Railway (NWR)' },

  // Southern Railway (SR)
  { code: 'MAS', name: 'Chennai', zone: 'Southern Railway (SR)' },
  { code: 'MDU', name: 'Madurai', zone: 'Southern Railway (SR)' },
  { code: 'PGT', name: 'Palakkad', zone: 'Southern Railway (SR)' },
  { code: 'SA', name: 'Salem', zone: 'Southern Railway (SR)' },
  { code: 'TPJ', name: 'Tiruchchirapalli', zone: 'Southern Railway (SR)' },
  { code: 'TVC', name: 'Thiruvananthapuram', zone: 'Southern Railway (SR)' },

  // South Central Railway (SCR)
  { code: 'SC', name: 'Secunderabad', zone: 'South Central Railway (SCR)' },
  { code: 'HYB', name: 'Hyderabad', zone: 'South Central Railway (SCR)' },
  { code: 'GTL', name: 'Guntakal', zone: 'South Central Railway (SCR)' },
  { code: 'GNT', name: 'Guntur', zone: 'South Central Railway (SCR)' },
  { code: 'BZA', name: 'Vijayawada', zone: 'South Central Railway (SCR)' },
  { code: 'NED', name: 'Nanded', zone: 'South Central Railway (SCR)' },

  // South Coast Railway (SCoR)
  { code: 'VSKP', name: 'Visakhapatnam', zone: 'South Coast Railway (SCoR)' },

  // South Eastern Railway (SER)
  { code: 'ADRA', name: 'Adra', zone: 'South Eastern Railway (SER)' },
  { code: 'CKP', name: 'Chakradharpur', zone: 'South Eastern Railway (SER)' },
  { code: 'KGP', name: 'Kharagpur', zone: 'South Eastern Railway (SER)' },
  { code: 'RNC', name: 'Ranchi', zone: 'South Eastern Railway (SER)' },

  // South East Central Railway (SECR)
  { code: 'BSP', name: 'Bilaspur', zone: 'South East Central Railway (SECR)' },
  { code: 'NAG', name: 'Nagpur (SECR)', zone: 'South East Central Railway (SECR)' },
  { code: 'R', name: 'Raipur', zone: 'South East Central Railway (SECR)' },

  // South Western Railway (SWR)
  { code: 'UBL', name: 'Hubballi', zone: 'South Western Railway (SWR)' },
  { code: 'SBC', name: 'Bengaluru', zone: 'South Western Railway (SWR)' },
  { code: 'MYS', name: 'Mysuru', zone: 'South Western Railway (SWR)' },

  // Western Railway (WR)
  { code: 'BCT', name: 'Mumbai Central', zone: 'Western Railway (WR)' },
  { code: 'BRC', name: 'Vadodara', zone: 'Western Railway (WR)' },
  { code: 'ADI', name: 'Ahmedabad', zone: 'Western Railway (WR)' },
  { code: 'RJT', name: 'Rajkot', zone: 'Western Railway (WR)' },
  { code: 'BVP', name: 'Bhavnagar', zone: 'Western Railway (WR)' },
  { code: 'RTM', name: 'Ratlam', zone: 'Western Railway (WR)' },

  // West Central Railway (WCR)
  { code: 'JBP', name: 'Jabalpur', zone: 'West Central Railway (WCR)' },
  { code: 'BPL', name: 'Bhopal', zone: 'West Central Railway (WCR)' },
  { code: 'KOTA', name: 'Kota', zone: 'West Central Railway (WCR)' },

  // Metro Railway Kolkata (MRK)
  { code: 'KMR', name: 'Kolkata Metro', zone: 'Metro Railway Kolkata (MRK)' },

  // Headquarter / CRIS
  { code: 'HQ', name: 'Railway Headquarter', zone: 'Indian Railways' },
  { code: 'CRIS', name: 'CRIS Office', zone: 'CRIS' }
];

const CODE_SET = new Set(RAILWAY_DIVISIONS.map(d => d.code.toUpperCase()));
const CODE_MAP = new Map(RAILWAY_DIVISIONS.map(d => [d.code.toUpperCase(), d]));

export function isValidDivisionCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return CODE_SET.has(code.trim().toUpperCase());
}

export function getDivisionDetails(code: string | null | undefined): DivisionInfo | undefined {
  if (!code) return undefined;
  return CODE_MAP.get(code.trim().toUpperCase());
}
