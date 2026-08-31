import { useState, useRef } from 'react';
import { Tag, Building2, MapPin, Mail, Phone, FileText, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Search, Users } from 'lucide-react';
import { lookupOldCustomerJDBC, lookupGlobalCustomerJDBC, lookupHandlingAgentJDBC } from '../services/customerService';

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
    const [verificationType, setVerificationType] = useState('customer'); // 'customer', 'global', 'agent'
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [customer, setCustomer] = useState(null);
    const [error, setError] = useState('');

    const verifyCode = async (e) => {
        e.preventDefault();
        if (!code.trim()) {
            setError(`Please enter a ${verificationType === 'global' ? 'Global Customer Code' : verificationType === 'agent' ? 'Agent Handling Code' : 'Customer Code'}.`);
            return;
        }

        setLoading(true);
        setError('');
        setCustomer(null);

        try {
            let data;
            if (verificationType === 'global') {
                data = await lookupGlobalCustomerJDBC(code.trim());
            } else if (verificationType === 'agent') {
                data = await lookupHandlingAgentJDBC(code.trim());
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
                        onClick={() => { setVerificationType('global'); setCode(''); setCustomer(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'global' ? '#2563eb' : '#f8fafc', color: verificationType === 'global' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        Global Customer Code
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setVerificationType('agent'); setCode(''); setCustomer(null); setError(''); }}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', background: verificationType === 'agent' ? '#2563eb' : '#f8fafc', color: verificationType === 'agent' ? 'white' : '#475569', cursor: 'pointer', fontWeight: '500' }}>
                        Agent Handling Code
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
                            {verificationType === 'global' ? 'Global Customer Code' : verificationType === 'agent' ? 'Agent Handling Code' : 'Customer Code'}
                        </label>
                        <div className="control">
                            <Tag size={15} />
                            <input 
                                id="customerCode" 
                                name="customerCode" 
                                value={code} 
                                onChange={(e) => setCode(e.target.value)} 
                                placeholder={verificationType === 'global' ? 'Enter Global Code' : verificationType === 'agent' ? 'Enter Agent Code' : 'Enter Customer Code'}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    
                    <div className="full" style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <button type="submit" className="submit" disabled={loading} style={{ padding: '8px 20px', height: 'auto' }}>
                            <Search size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }}/>
                            {loading ? 'Checking Code...' : verificationType === 'global' ? 'Verify Global Code' : verificationType === 'agent' ? 'Verify Agent Code' : 'Verify Customer Code'}
                        </button>
                        {(customer || error) && (
                            <button type="button" className="reset" onClick={reset} style={{ marginLeft: '10px', padding: '8px 20px', height: 'auto' }}>
                                Reset
                            </button>
                        )}
                    </div>
                </form>

                {customer && verificationType === 'customer' && (
                    <div className="customer-details">
                        <div className="gstins-header" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', marginBottom: '16px' }}>
                            <h3>Customer Information</h3>
                        </div>
                        
                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Customer Code</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Company</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>State</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>GSTIN</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!customer.gstinNumbers || customer.gstinNumbers.trim() === '') ? (
                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '12px 16px' }}>{customer.customerCode || code}</td>
                                            <td style={{ padding: '12px 16px' }}>{customer.companyName || '-'}</td>
                                            <td style={{ padding: '12px 16px' }}>-</td>
                                            <td style={{ padding: '12px 16px', color: '#64748b', fontStyle: 'italic' }}>No GSTIN registered</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>Active</span>
                                            </td>
                                        </tr>
                                    ) : (
                                        customer.gstinNumbers.replace(/[\[\]"\s]/g, '').split(',').filter(Boolean).map((gstin, index) => {
                                            const stateCode = gstin.substring(0, 2);
                                            const stateName = GSTIN_STATE_CODES[stateCode] || 'Unknown';
                                            
                                            return (
                                                <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '12px 16px' }}>{customer.customerCode || code}</td>
                                                    <td style={{ padding: '12px 16px' }}>{customer.companyName || '-'}</td>
                                                    <td style={{ padding: '12px 16px' }}>{stateName}</td>
                                                    <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{gstin}</td>
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>Active</span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {customer && (verificationType === 'global' || verificationType === 'agent') && (
                    <div className="customer-details">
                        <div className="gstins-header" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', marginBottom: '16px' }}>
                            <h3>{verificationType === 'global' ? 'Global Customer Information' : 'Handling Agent Information'}</h3>
                        </div>
                        
                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Code</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Company</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>City</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Address</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Email</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Mobile</th>
                                        <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '600' }}>{customer.code || '-'}</td>
                                        <td style={{ padding: '12px 16px' }}>{customer.companyName || '-'}</td>
                                        <td style={{ padding: '12px 16px' }}>{customer.city || '-'}</td>
                                        <td style={{ padding: '12px 16px', maxWidth: '200px' }}>{customer.address || '-'}</td>
                                        <td style={{ padding: '12px 16px' }}>{customer.email || '-'}</td>
                                        <td style={{ padding: '12px 16px' }}>{customer.mobile || '-'}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>{customer.status || 'Active'}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
