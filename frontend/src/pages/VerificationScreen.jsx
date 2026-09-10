import { useState, useRef } from 'react';
import { Tag, Building2, MapPin, Mail, Phone, FileText, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Search, Users } from 'lucide-react';
import { lookupOldCustomerJDBC, lookupCustomerByGstinJDBC } from '../services/customerService';

const GSTIN_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', 
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', 
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', 
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', 
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', 
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh', 
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', 
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh (New)', 
  '38': 'Ladakh'
};

export default function VerificationScreen() {
    const [verificationType, setVerificationType] = useState('customer'); // 'customer', 'gstin'
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState(null);
    const [error, setError] = useState('');

    const verifyCode = async (e) => {
        e.preventDefault();
        const trimmedCode = code.trim();
        if (!trimmedCode) {
            setError(`Please enter a ${verificationType === 'gstin' ? 'GSTIN' : 'Customer Code'}.`);
            return;
        }

        setLoading(true);
        setError('');
        setCustomers(null);

        try {
            let data;
            if (verificationType === 'gstin') {
                data = await lookupCustomerByGstinJDBC(trimmedCode);
                // The API returns an array for GSTIN
                setCustomers(Array.isArray(data) ? data : [data]);
            } else {
                data = await lookupOldCustomerJDBC(trimmedCode);
                // The API returns a single object for Customer Code
                setCustomers([data]);
            }
        } catch (err) {
            console.error("Lookup error:", err);
            // Default to exact requested error messages
            const msg = err.message || 'Code not found.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setCode('');
        setCustomers(null);
        setError('');
    };

    return (
        <main>
            <div className="card">
                <div className="card-head" style={{ borderBottom: '1px dotted #dce4eb', paddingBottom: '16px', marginBottom: '16px' }}>
                    <div className="title-icon">
                        <Search />
                        <div>
                            <h1>Verification Screen</h1>
                            <p>Verify whether a code exists in the system</p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
                    <button 
                        type="button" 
                        onClick={() => { setVerificationType('customer'); setCode(''); setCustomers(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'customer' ? '#2563eb' : '#f8fafc', color: verificationType === 'customer' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        Customer Code
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setVerificationType('gstin'); setCode(''); setCustomers(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'gstin' ? '#2563eb' : '#f8fafc', color: verificationType === 'gstin' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        GSTIN
                    </button>
                </div>

                {error && <div className="lookup-error"><AlertCircle size={14} /> {error}</div>}
                
                {customers && customers.length > 0 && !loading && (
                    <div className="info-banner" style={{ background: '#e7f7ed', color: '#126c38', borderColor: '#16a34a' }}>
                        <CheckCircle2 size={16} /> Code verified successfully. Found {customers.length} record(s).
                    </div>
                )}

                <form onSubmit={verifyCode} className="grid">
                    <div className="field full" style={{ maxWidth: '400px', margin: '0 auto 10px', textAlign: 'center' }}>
                        <label htmlFor="customerCode">
                            {verificationType === 'gstin' ? 'Enter GSTIN' : 'Enter Customer Code'}
                        </label>
                        <div className="control">
                            <Tag size={15} />
                            <input 
                                id="customerCode" 
                                name="customerCode" 
                                value={code} 
                                onChange={(e) => setCode(e.target.value)} 
                                placeholder={verificationType === 'gstin' ? 'Enter GSTIN' : 'Enter Customer Code'}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    
                    <div className="full" style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <button type="submit" className="submit" disabled={loading} style={{ padding: '8px 20px', height: 'auto' }}>
                            <Search size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }}/>
                            {loading ? 'Searching...' : verificationType === 'gstin' ? 'Verify GSTIN' : 'Verify Customer Code'}
                        </button>
                        {(customers || error) && (
                            <button type="button" className="reset" onClick={reset} style={{ marginLeft: '10px', padding: '8px 20px', height: 'auto' }}>
                                Reset
                            </button>
                        )}
                    </div>
                </form>

                {customers && customers.length > 0 && (
                    <div className="customer-details">
                        <h3 style={{ marginBottom: '10px', color: '#1e293b' }}>Search Results</h3>
                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px', whiteSpace: 'nowrap' }}>
                                <thead>
                                    <tr style={{ background: '#2563eb', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Global Customer Code</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>GSTIN</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Company Name</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Address</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>PAN</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>City</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Date</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Division</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((c, i) => {
                                        // If a customer record has multiple comma-separated GSTINs, render each as a sub-row to match the requested UI
                                        const gstinList = (!c.gstinNumbers || c.gstinNumbers.trim() === '') ? ['-'] : c.gstinNumbers.replace(/[\[\]"\s]/g, '').split(',').filter(Boolean);
                                        return gstinList.map((g, gIdx) => (
                                            <tr key={`${i}-${gIdx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{c.customerCode || code}</td>
                                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: g === '-' ? '#64748b' : 'inherit' }}>{g}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.companyName || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.address || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.panNumber || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.city || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.creationDate || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{c.division || '-'}</td>
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
