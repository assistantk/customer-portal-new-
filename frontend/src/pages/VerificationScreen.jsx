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
    const [customer, setCustomer] = useState(null);
    const [error, setError] = useState('');

    const verifyCode = async (e) => {
        e.preventDefault();
        const trimmedCode = code.trim();
        if (!trimmedCode) {
            setError(`Please enter a ${verificationType === 'gstin' ? 'GSTIN' : 'Customer Code'}.`);
            return;
        }
        if (verificationType === 'gstin' && trimmedCode.length !== 15) {
            setError('Please enter a valid 15-character GSTIN.');
            return;
        }

        setLoading(true);
        setError('');
        setCustomer(null);

        try {
            let data;
            if (verificationType === 'gstin') {
                data = await lookupCustomerByGstinJDBC(code.trim());
            } else {
                data = await lookupOldCustomerJDBC(code.trim());
            }
            setCustomer(data);
        } catch (err) {
            console.error("Lookup error:", err);
            setError(err.message || 'Code not found.');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setCode('');
        setCustomer(null);
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
                        onClick={() => { setVerificationType('customer'); setCode(''); setCustomer(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'customer' ? '#2563eb' : '#f8fafc', color: verificationType === 'customer' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        Customer Code
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setVerificationType('gstin'); setCode(''); setCustomer(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'gstin' ? '#2563eb' : '#f8fafc', color: verificationType === 'gstin' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        GSTIN
                    </button>
                </div>

                {error && <div className="lookup-error"><AlertCircle size={14} /> {error}</div>}
                
                {customer && !loading && (
                    <div className="info-banner" style={{ background: '#e7f7ed', color: '#126c38', borderColor: '#16a34a' }}>
                        <CheckCircle2 size={16} /> Code verified successfully
                    </div>
                )}

                <form onSubmit={verifyCode} className="grid">
                    <div className="field full" style={{ maxWidth: '400px', margin: '0 auto 10px', textAlign: 'center' }}>
                        <label htmlFor="customerCode">
                            {verificationType === 'gstin' ? 'GSTIN' : 'Customer Code'}
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
                            {loading ? 'Checking...' : verificationType === 'gstin' ? 'Find Customer' : 'Verify Customer Code'}
                        </button>
                        {(customer || error) && (
                            <button type="button" className="reset" onClick={reset} style={{ marginLeft: '10px', padding: '8px 20px', height: 'auto' }}>
                                Reset
                            </button>
                        )}
                    </div>
                </form>

                {customer && (
                    <div className="customer-details">
                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '16px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                                <thead>
                                    <tr style={{ background: '#2563eb', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Customer Code</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Company Name</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Address</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>GSTIN</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>PAN</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Date</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#ffffff' }}>Division</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!customer.gstinNumbers || customer.gstinNumbers.trim() === '') ? (
                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{customer.customerCode || code}</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.companyName || '-'}</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.address || '-'}</td>
                                            <td style={{ padding: '12px 16px', color: '#64748b', fontStyle: 'italic' }}>-</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.panNumber || '-'}</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.creationDate || '-'}</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.division || '-'}</td>
                                        </tr>
                                    ) : (
                                        customer.gstinNumbers.replace(/[\[\]"\s]/g, '').split(',').filter(Boolean).map((gstin, index) => (
                                            <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{customer.customerCode || code}</td>
                                                <td style={{ padding: '12px 16px' }}>{customer.companyName || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{customer.address || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{gstin}</td>
                                                <td style={{ padding: '12px 16px' }}>{customer.panNumber || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{customer.creationDate || '-'}</td>
                                                <td style={{ padding: '12px 16px' }}>{customer.division || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}


            </div>
        </main>
    );
}
