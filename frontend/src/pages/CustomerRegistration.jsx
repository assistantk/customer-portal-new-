import { useEffect, useRef, useState, useCallback } from 'react';
import { Building2, Tag, MapPin, FileText, UploadCloud, Globe, Mail, Phone, ShieldCheck, RotateCcw, Send, UserRound, ChevronDown, Plus, Loader2, CheckCircle2, AlertCircle, Users, Search, Trash2, Paperclip } from 'lucide-react';
import { getMasterData, lookupCustomer, lookupOldCustomerJDBC, generateUniqueCode, registerCustomer, updateCustomer, deleteGstin } from '../services/customerService';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

const blank = { companyName: '', customerCode: '', address: '', city: '', pincode: '', panNumber: '', operatingDivision: '', zone: '', email: '', mobile: '', globalCustomerCode: '', handlingAgentCode: '' };
const checkPanFile = f => { if (!f) return ''; if (f.size > 5242880) return 'File size must not exceed 5MB'; if (f.type !== 'application/pdf') return 'Only PDF files are allowed'; return '' };
const blankGstin = { gstinId: null, state: '', stateCode: '', gstin: '', file: null, existingFileName: '' };
const initialMasterData = { cities: { Delhi: ['110001', '110002'], Mumbai: ['400001', '400002'], Kolkata: ['700001', '700002'], Chennai: ['600001', '600002'] } };
const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

const divisionsByZone = {
    'Central Railway (CR)': ['Mumbai (CSTM)', 'Bhusawal (BSL)', 'Nagpur (NGP)', 'Pune (PUNE)', 'Solapur (SUR)'],
    'Eastern Railway (ER)': ['Howrah (HWH)', 'Sealdah (SDAH)', 'Asansol (ASN)', 'Malda (MLDT)'],
    'East Central Railway (ECR)': ['Danapur (DNR)', 'Dhanbad (DHN)', 'Pt. Deen Dayal Upadhyaya (DDU)', 'Samastipur (SPJ)', 'Sonpur (SEE)'],
    'East Coast Railway (ECOR)': ['Khurda Road (KUR)', 'Sambalpur (SBP)', 'Rayagada (RGDA)'],
    'Northern Railway (NR)': ['Delhi (DLI)', 'Ambala (UMB)', 'Firozpur (FZR)', 'Lucknow (LKO)', 'Moradabad (MB)'],
    'North Central Railway (NCR)': ['Prayagraj (PRYJ)', 'Agra (AGC)', 'Jhansi (JHS)'],
    'North Eastern Railway (NER)': ['Izzatnagar (IZN)', 'Lucknow (LJN)', 'Varanasi (BSB)'],
    'Northeast Frontier Railway (NFR)': ['Alipurduar (APDJ)', 'Katihar (KIR)', 'Lumding (LMG)', 'Rangiya (RNY)', 'Tinsukia (TSK)'],
    'North Western Railway (NWR)': ['Jaipur (JP)', 'Ajmer (AII)', 'Bikaner (BKN)', 'Jodhpur (JU)'],
    'Southern Railway (SR)': ['Chennai (MAS)', 'Madurai (MDU)', 'Palakkad (PGT)', 'Salem (SA)', 'Tiruchchirapalli (TPJ)', 'Thiruvananthapuram (TVC)'],
    'South Central Railway (SCR)': ['Secunderabad (SC)', 'Hyderabad (HYB)', 'Nanded (NED)'],
    'South Coast Railway (SCoR)': ['Visakhapatnam (VSKP)', 'Vijayawada (BZA)', 'Guntur (GNT)', 'Guntakal (GTL)'],
    'South Eastern Railway (SER)': ['Adra (ADRA)', 'Chakradharpur (CKP)', 'Kharagpur (KGP)', 'Ranchi (RNC)'],
    'South East Central Railway (SECR)': ['Bilaspur (BSP)', 'Nagpur (NAG)', 'Raipur (R)'],
    'South Western Railway (SWR)': ['Hubballi (UBL)', 'Bengaluru (SBC)', 'Mysuru (MYS)'],
    'Western Railway (WR)': ['Mumbai Central (BCT)', 'Vadodara (BRC)', 'Ahmedabad (ADI)', 'Rajkot (RJT)', 'Bhavnagar (BVP)', 'Ratlam (RTM)'],
    'West Central Railway (WCR)': ['Jabalpur (JBP)', 'Bhopal (BPL)', 'Kota (KOTA)'],
    'Metro Railway Kolkata (MRK)': ['Kolkata Metro (KMR)']
};
const gstinRe = /^[A-Za-z0-9]{15}$/, panRe = /^[A-Za-z0-9]{10}$/, mobileRe = /^[6-9][0-9]{9}$/;
const normalizeAddress = value => value.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP_WORDS = new Set(['pvt', 'ltd', 'limited', 'private', 'company', 'co', 'inc', 'llp', 'the', 'and', 'of', 'for', 'a', 'an', 'in', 'on', 'at', 'to', 'by', 'with', 'group', 'enterprises', 'solutions', 'services', 'industries', 'corporation', 'corp']);

function generateCodeFromName(name) {
    if (!name || !name.trim()) return '';
    const words = name.trim().split(/\s+/);
    const significant = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
    if (significant.length === 0) return words.map(w => w[0]).join('').toUpperCase();
    const parts = significant.map(w => (w === w.toUpperCase() && w.length <= 5) ? w : w[0]);
    return parts.join('').toUpperCase().slice(0, 8);
}

function Field({ label, name, icon: Icon, form, setForm, error, readOnly, ...rest }) {
    return <div className="field"><label htmlFor={name}>{label} <b>*</b></label><div className={'control ' + (error ? 'invalid' : '')}><Icon size={15} /><input id={name} name={name} value={form[name]} readOnly={readOnly} onChange={e => setForm({ ...form, [name]: e.target.value })} {...rest} /></div>{error && <small className="error">{error}</small>}</div>;
}
function Select({ label, name, icon: Icon, options, form, setForm, error, disabled, onValueChange, formatOption = value => value }) {
    return <div className="field"><label htmlFor={name}>{label} <b>*</b></label><div className={'control select ' + (error ? 'invalid' : '')}><Icon size={15} /><select id={name} value={form[name]} disabled={disabled} onChange={e => onValueChange ? onValueChange(e.target.value) : setForm({ ...form, [name]: e.target.value })}><option value="">Select {label.toLowerCase()}</option>{options.map(v => <option key={v} value={v}>{formatOption(v)}</option>)}</select><ChevronDown size={14} /></div>{error && <small className="error">{error}</small>}</div>;
}
function DivisionSelect({ options, form, setForm, error, disabled }) {
    const [open, setOpen] = useState(false);
    const choose = division => { setForm(prev => ({ ...prev, operatingDivision: division })); setOpen(false); };
    const divisionCode = form.operatingDivision.match(/\(([^)]+)\)$/)?.[1] || '';
    const selectedDivision = divisionCode ? `SR.DCM/${divisionCode}` : 'Select division';
    const divisionLabel = divisionCode ? `Division (SR.DCM/${divisionCode})` : 'Division (SR.DCM/)';
    return <div className="field zone-field"><label id="division-label">{divisionLabel} <b>*</b></label><button type="button" className={'control zone-trigger ' + (error ? 'invalid' : '')} aria-labelledby="division-label" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)}><Globe size={15} /><span>{selectedDivision}</span><ChevronDown size={14} /></button>{open && <div className="zone-menu" role="listbox" aria-label="Division options"><button type="button" className="zone-option" onClick={() => choose('')}>Select division</button>{options.map(division => <button type="button" className="zone-option" role="option" aria-selected={form.operatingDivision === division} key={division} onClick={() => choose(division)}>{division}</button>)}</div>}{error && <small className="error">{error}</small>}</div>;
}

function ZoneSelect({ options, form, setForm, error }) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const choose = zone => { setForm(prev => ({ ...prev, zone, operatingDivision: '' })); setSearchTerm(''); setOpen(false); };
    const toggleOpen = () => { setOpen(current => !current); if (open) setSearchTerm(''); };
    const filteredOptions = options.filter(zone => zone.toLowerCase().includes(searchTerm.toLowerCase()));
    return <div className="field zone-field"><label id="zone-label">Zone <b>*</b></label><button type="button" className={'control zone-trigger ' + (error ? 'invalid' : '')} aria-labelledby="zone-label" aria-expanded={open} onClick={toggleOpen}><Globe size={15} /><span>{form.zone || 'Select zone'}</span><ChevronDown size={14} /></button>{open && <div className="zone-menu" role="listbox" aria-label="Zone options"><div className="zone-search"><Search size={14} /><input type="search" aria-label="Search zones" placeholder="Search zone" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div><button type="button" className="zone-option" onClick={() => choose('')}>Select zone</button>{filteredOptions.length ? filteredOptions.map(zone => <button type="button" className="zone-option" role="option" aria-selected={form.zone === zone} key={zone} onClick={() => choose(zone)}>{zone}</button>) : <div className="zone-empty">No zones found</div>}</div>}{error && <small className="error">{error}</small>}</div>;
}

export default function CustomerRegistration() {
    const [mode, setMode] = useState('old');
    const [codeType, setCodeType] = useState('GLOBAL');
    const [form, setForm] = useState(blank);
    const [gstins, setGstins] = useState([{ ...blankGstin }]);
    const [panFile, setPanFile] = useState(null);
    const [existingPanFileName, setExistingPanFileName] = useState('');
    const [data, setData] = useState(initialMasterData);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupDone, setLookupDone] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [codeChecking, setCodeChecking] = useState(false);
    const [codeConfirmed, setCodeConfirmed] = useState(false);
    // Track GSTINs that were removed during an Old User edit session
    const [removedGstinIds, setRemovedGstinIds] = useState([]);
    const fileRefs = useRef([]);
    const panFileRef = useRef(null);
    const codeTimerRef = useRef(null);
    const lookupTimerRef = useRef(null);

    useEffect(() => { getMasterData().then(setData).catch(() => { }) }, []);

    const reset = () => {
        setForm(blank); setGstins([{ ...blankGstin }]); setErrors({}); setNotice('');
        setLookupDone(false); setLookupError('');
        setCodeConfirmed(false); setCodeChecking(false); setCodeType('GLOBAL');
        setRemovedGstinIds([]);
        setPanFile(null); setExistingPanFileName('');
        fileRefs.current.forEach(ref => { if (ref) ref.value = '' });
        if (panFileRef.current) panFileRef.current.value = '';
    };

    const switchMode = (newMode) => { reset(); setMode(newMode); };

    /* ===== Old User: lookup by customer code ===== */
    const handleOldCodeChange = (code) => {
        setForm(prev => ({ ...prev, customerCode: code }));
        setLookupDone(false); setLookupError('');
        if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
        if (code.trim().length >= 2) {
            setLookupLoading(true);
            lookupTimerRef.current = setTimeout(async () => {
                try {
                    const customer = await lookupOldCustomerJDBC(code.trim());
                    setForm({
                        companyName: customer.companyName || '',
                        customerCode: code,
                        address: customer.address || '',
                        city: '',
                        pincode: '',
                        panNumber: '',
                        operatingDivision: '',
                        zone: '',
                        email: customer.emailId || '',
                        mobile: customer.phoneNumber || '',
                        globalCustomerCode: '',
                        handlingAgentCode: '',
                    });
                    setPanFile(null);
                    setExistingPanFileName('');
                    if (panFileRef.current) panFileRef.current.value = '';
                    setGstins([{ ...blankGstin }]);
                    setRemovedGstinIds([]);
                    setLookupDone(true); setLookupError('');
                } catch (err) {
                    console.error("Lookup error:", err);
                    setLookupDone(false); 
                    setLookupError(err.message || 'Error occurred while fetching customer data');
                    setForm({
                        companyName: '',
                        customerCode: code,
                        address: '',
                        city: '',
                        pincode: '',
                        panNumber: '',
                        operatingDivision: '',
                        zone: '',
                        email: '',
                        mobile: '',
                        globalCustomerCode: '',
                        handlingAgentCode: '',
                    });
                    setGstins([{ ...blankGstin }]);
                } finally {
                    setLookupLoading(false);
                }
            }, 800);
        } else {
            setLookupLoading(false);
        }
    };

    /* ===== New User: generate code from company name ===== */
    const handleNewCompanyNameChange = useCallback((newName) => {
        setForm(prev => ({ ...prev, companyName: newName }));
        const code = generateCodeFromName(newName);
        setCodeConfirmed(false);
        if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
        if (code) {
            setForm(prev => ({ ...prev, customerCode: code }));
            setCodeChecking(true);
            codeTimerRef.current = setTimeout(async () => {
                try {
                    const unique = await generateUniqueCode(newName, codeType);
                    setForm(prev => ({ ...prev, customerCode: unique }));
                    setCodeConfirmed(true);
                } catch {
                    setCodeConfirmed(false);
                } finally {
                    setCodeChecking(false);
                }
            }, 600);
        } else {
            setForm(prev => ({ ...prev, customerCode: '' }));
            setCodeChecking(false);
        }
    }, [codeType]);

    /* Re-generate code when codeType changes and company name is already entered */
    useEffect(() => {
        if (mode === 'new' && form.companyName.trim()) {
            handleNewCompanyNameChange(form.companyName);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeType]);

    const checkFile = f => { if (!f) return 'GSTIN file is required'; if (f.size > 5242880) return 'File size must not exceed 5MB'; if (f.type !== 'application/pdf') return 'Only PDF files are allowed'; return '' };

    const validate = () => {
        let e = {};
        // Required field checks — exclude globalCustomerCode/handlingAgentCode from required
        const requiredFields = ['companyName', 'customerCode', 'address', 'city', 'pincode', 'panNumber', 'operatingDivision', 'zone', 'email', 'mobile'];
        requiredFields.forEach(k => { if (!form[k]) e[k] = 'This field is required' });
        if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Invalid email';
        if (form.mobile && !mobileRe.test(form.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number';
        if (form.pincode && !/^[1-9][0-9]{5}$/.test(form.pincode)) e.pincode = 'Invalid pincode';
        if (form.panNumber && !panRe.test(form.panNumber)) e.panNumber = 'PAN No. must contain exactly 10 letters or numbers';
        if (!panFile && !existingPanFileName) e.panFile = 'PAN card PDF is required';
        else if (panFile) { const pe = checkPanFile(panFile); if (pe) e.panFile = pe; }

        let stateSet = new Set();
        let gstinSet = new Set();
        gstins.forEach((g, i) => {
            if (!g.state) e[`gstin_${i}_state`] = 'State is required';
            else if (stateSet.has(g.state)) e[`gstin_${i}_state`] = 'State already added';
            else stateSet.add(g.state);

            if (!g.gstin) e[`gstin_${i}_gstin`] = 'GSTIN is required';
            else if (!gstinRe.test(g.gstin)) e[`gstin_${i}_gstin`] = 'Must be exactly 15 alphanumeric characters';
            else if (gstinSet.has(g.gstin)) e[`gstin_${i}_gstin`] = 'GSTIN already added';
            else gstinSet.add(g.gstin);

            if (!g.file && !g.existingFileName) {
                e[`gstin_${i}_file`] = 'GSTIN file is required';
            } else if (g.file) {
                const fe = checkFile(g.file);
                if (fe) e[`gstin_${i}_file`] = fe;
            }
        });

        if (mode === 'new' && !codeConfirmed && form.companyName) {
            if (codeChecking) {
                e.customerCode = 'Please wait — code is being verified';
            } else {
                e.customerCode = 'Failed to verify code. Make sure the Java backend is running with the latest code.';
            }
        }
        setErrors(e);
        return !Object.keys(e).length;
    };

    /* ===== Form Submission ===== */
    const submit = async e => {
        e.preventDefault(); setNotice('');
        if (!validate()) return;
        setLoading(true);
        try {
            if (mode === 'new') {
                /* --- New Entry: create customer + GSTINs --- */
                const result = await registerCustomer(
                    { ...form, codeType, panFile },
                    gstins
                );
                setNotice(result.message || 'Customer registration submitted successfully');
                reset();
            } else {
                /* --- Old User: update customer + manage GSTINs --- */
                // First, delete any GSTINs that were removed
                for (const gstinId of removedGstinIds) {
                    try {
                        await deleteGstin(form.customerCode, gstinId);
                    } catch {
                        // Silently skip if already deleted
                    }
                }

                // Then update customer + upsert GSTINs
                const result = await updateCustomer(
                    form.customerCode,
                    { ...form, panFile },
                    gstins
                );
                setNotice(result.message || 'Customer updated successfully');
                setRemovedGstinIds([]);
                // Re-lookup to refresh data from DB
                try {
                    const refreshed = await lookupCustomer(form.customerCode);
                    setForm(prev => ({
                        ...prev,
                        companyName: refreshed.companyName || prev.companyName,
                        address: refreshed.address || prev.address,
                        city: refreshed.city || prev.city,
                        pincode: refreshed.pincode || prev.pincode,
                        panNumber: refreshed.panNumber || prev.panNumber,
                        email: refreshed.email || prev.email,
                        mobile: refreshed.mobile || prev.mobile,
                        globalCustomerCode: refreshed.globalCustomerCode || '',
                        handlingAgentCode: refreshed.handlingAgentCode || '',
                    }));
                    if (refreshed.gstins && refreshed.gstins.length > 0) {
                        setGstins(refreshed.gstins.map(g => ({
                            gstinId: g.gstinId || null,
                            state: g.state,
                            stateCode: g.stateCode || '',
                            gstin: g.gstin,
                            file: null,
                            existingFileName: g.existingFileName || g.gstinFileName || '',
                        })));
                    }
                } catch {
                    // refresh failed, keep current state
                }
            }
        } catch (error) { 
            let msg = error.message;
            if (msg.length > 200) msg = msg.split('- [com.cris')[0].substring(0, 150) + '...';
            setNotice(msg);
        } finally { 
            setLoading(false);
        }
    };

    const addGstin = () => setGstins([...gstins, { ...blankGstin }]);
    const removeGstin = (index) => {
        const removed = gstins[index];
        // Track removed GSTINs that exist in the database (have an ID)
        if (removed.gstinId) {
            setRemovedGstinIds(prev => [...prev, removed.gstinId]);
        }
        setGstins(gstins.filter((_, i) => i !== index));
    };
    const handleGstinChange = (index, updates) => {
        const newGstins = [...gstins];
        newGstins[index] = { ...newGstins[index], ...updates };
        setGstins(newGstins);
    };
    const handleGstinFileChange = async (index, e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        const error = checkFile(selected);
        handleGstinChange(index, { file: error ? null : selected });
        setErrors(prev => ({ ...prev, [`gstin_${index}_file`]: error }));
    };
    const handlePanFileChange = async (e) => {
        const selected = e.target.files[0];
        const error = checkPanFile(selected);
        setPanFile(error ? null : selected);
        setErrors(prev => ({ ...prev, panFile: error }));
    };

    const cities = Object.keys(data?.cities || {}), pins = form.city ? (data?.cities?.[form.city] || []) : [], zones = Object.keys(divisionsByZone), divisions = form.zone ? (divisionsByZone[form.zone] || []) : [];

    return <div className="app">
        <header>
            <div className="brand">
                <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
                <span>CUSTOMER REGISTRATION PORTAL</span>
            </div>
            <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
        </header>

        

        <main><form className="card" onSubmit={submit}>
            <div className="card-head">
                <div className="title-icon"><UserRound /><div>
                    <h1>Customer Registration</h1>
                    <p>{mode === 'old' ? 'Look up existing customer record' : 'Register new customer account'}</p>
                </div></div>
                <div className="railways-banner"><img src={indianRailwaysLogo} alt="Indian Railways" /></div>
                <div className="mode-tabs">
                    <button type="button" className={'mode-tab' + (mode === 'old' ? ' active' : '')} onClick={() => switchMode('old')}>
                        <Users size={14} /> Old User
                    </button>
                    <button type="button" className={'mode-tab' + (mode === 'new' ? ' active' : '')} onClick={() => switchMode('new')}>
                        <Plus size={14} /> New Entry
                    </button>
                </div>
            </div>
            <div className="rule" />

            {notice && <div className={notice.toLowerCase().includes('success') ? 'notice success' : 'notice'} role="alert">{notice}</div>}
            {mode === 'old' && lookupDone && <div className="info-banner"><CheckCircle2 size={16} /> Information loaded from previous registration. You may update fields and re-upload files before submitting.</div>}
            {mode === 'old' && lookupError && <div className="lookup-error"><AlertCircle size={14} /> {lookupError}</div>}

            {/* === Main Form: 3-column grid === */}
            <div className="grid">
                {/* Row 1: Customer Code | Company Name | PAN No. */}
                {mode === 'old' ? (
                    <div className="field">
                        <label htmlFor="customerCode">Customer Code <b>*</b></label>
                        <div className={'control ' + (errors.customerCode ? 'invalid' : '')}>
                            <Tag size={15} />
                            <input id="customerCode" name="customerCode" value={form.customerCode} placeholder="Enter customer code" onChange={e => handleOldCodeChange(e.target.value)} />
                            {lookupLoading && <Loader2 size={14} className="spin field-status" />}
                            {lookupDone && !lookupLoading && <CheckCircle2 size={14} className="field-status code-ok" />}
                        </div>
                        {errors.customerCode && <small className="error">{errors.customerCode}</small>}
                    </div>
                ) : (
                    <div className="field">
                        <label htmlFor="customerCode">Customer Code <b>*</b></label>
                        <div className="code-type-toggle">
                            <button type="button" className={'code-type-btn' + (codeType === 'GLOBAL' ? ' active' : '')} onClick={() => setCodeType('GLOBAL')}><Globe size={13} /> Global Code</button>
                            <button type="button" className={'code-type-btn' + (codeType === 'HANDLING_AGENT' ? ' active' : '')} onClick={() => setCodeType('HANDLING_AGENT')}><Users size={13} /> Handling Agent Code</button>
                        </div>
                        <div className="control generated-code-control">
                            <Tag size={15} />
                            <input id="customerCode" name="customerCode" value={form.customerCode} readOnly placeholder="Auto-generated from company name" />
                            <span className="code-status">
                                {codeChecking && <Loader2 size={14} className="spin" />}
                                {codeConfirmed && !codeChecking && <CheckCircle2 size={14} className="code-ok" />}
                            </span>
                        </div>
                        {codeConfirmed && <small className="code-confirmed">✓ {codeType === 'GLOBAL' ? 'Global' : 'Handling Agent'} Code "{form.customerCode}" is available</small>}
                        {errors.customerCode && <small className="error">{errors.customerCode}</small>}
                    </div>
                )}

                {mode === 'old' ? (
                    <Field label="Company Name" name="companyName" icon={Building2} placeholder="Enter company name" form={form} setForm={setForm} error={errors.companyName} />
                ) : (
                    <div className="field">
                        <label htmlFor="companyName">Company Name <b>*</b></label>
                        <div className={'control ' + (errors.companyName ? 'invalid' : '')}>
                            <Building2 size={15} />
                            <input id="companyName" name="companyName" value={form.companyName} placeholder="Enter company name" onChange={e => handleNewCompanyNameChange(e.target.value)} />
                        </div>
                        {errors.companyName && <small className="error">{errors.companyName}</small>}
                    </div>
                )}

                <div className="field pan-field">
                    <label htmlFor="panNumber">PAN No. <b>*</b></label>
                    <div className={'control pan-control ' + (errors.panNumber || errors.panFile ? 'invalid' : '')}>
                        <FileText size={15} />
                        <input id="panNumber" name="panNumber" value={form.panNumber} maxLength="10" placeholder="Enter 10-character PAN No." onChange={e => setForm({ ...form, panNumber: e.target.value })} />
                        <button type="button" className={'pan-upload-btn' + (panFile || existingPanFileName ? ' has-file' : '')} onClick={() => panFileRef.current?.click()} title={panFile ? panFile.name : (existingPanFileName || 'Upload PAN Card PDF')}>
                            <UploadCloud size={14} />
                            <span className="pan-upload-label">{panFile ? panFile.name : (existingPanFileName || 'Upload PDF')}</span>
                        </button>
                    </div>
                    <input ref={panFileRef} className="hidden" type="file" accept=".pdf" onChange={handlePanFileChange} />
                    {errors.panNumber && <small className="error">{errors.panNumber}</small>}
                    {errors.panFile && <small className="error">{errors.panFile}</small>}
                </div>

                {/* Row 2: Address | City | Pincode */}
                <Field label="Address" name="address" icon={MapPin} placeholder="Enter complete business address" form={form} setForm={setForm} error={errors.address} />
                <Select label="City" name="city" icon={MapPin} options={cities} form={form} setForm={setForm} onValueChange={city => setForm(prev => ({ ...prev, city, pincode: '' }))} error={errors.city} />
                <Select label="Pincode" name="pincode" icon={Mail} options={pins} form={form} setForm={setForm} error={errors.pincode} disabled={!form.city} />

                {/* Row 3: Zone | Division | Email */}
                <ZoneSelect options={zones} form={form} setForm={setForm} error={errors.zone} />
                <DivisionSelect options={divisions} form={form} setForm={setForm} error={errors.operatingDivision} disabled={!form.zone} />
                <Field label="Email" name="email" icon={Mail} type="email" placeholder="Enter email address" form={form} setForm={setForm} error={errors.email} />

                {/* Row 4: Mobile */}
                <Field label="Mobile" name="mobile" icon={Phone} inputMode="numeric" maxLength="10" placeholder="Enter 10-digit number" form={form} setForm={setForm} error={errors.mobile} />
            </div>

            {/* === State-wise GSTINs === */}
            <div className="gstins-container">
                <div className="gstins-header">
                    <h3>State-wise GSTINs</h3>
                    <button type="button" className="add-gstin-btn" onClick={addGstin}><Plus size={14} /> Add GSTIN</button>
                </div>
                <div className="gstin-grid">
                    {gstins.map((g, index) => (
                        <div key={index} className="gstin-card">
                            <div className="gstin-card-head">
                                <h4>GSTIN {index + 1}</h4>
                                {index > 0 && <button type="button" className="remove-btn" onClick={() => removeGstin(index)}><Trash2 size={13} /></button>}
                            </div>
                            <div className="grid">
                                <Select label="State" name="state" icon={MapPin} options={INDIAN_STATES} form={g} onValueChange={val => handleGstinChange(index, { state: val })} error={errors[`gstin_${index}_state`]} />
                                <div className="field gstin-number-field">
                                    <label htmlFor={`gstin-${index}`}>GSTIN No. <b>*</b></label>
                                    <div className={'control gstin-control ' + (errors[`gstin_${index}_gstin`] || errors[`gstin_${index}_file`] ? 'invalid' : '')}>
                                        <FileText size={15} />
                                        <input id={`gstin-${index}`} name="gstin" value={g.gstin} maxLength="15" placeholder="Enter GSTIN Number" onChange={e => handleGstinChange(index, { gstin: e.target.value })} />
                                        <button type="button" className={'gstin-upload-btn' + (g.file || g.existingFileName ? ' has-file' : '')} onClick={() => fileRefs.current[index]?.click()} title={g.file ? g.file.name : (g.existingFileName || 'Upload GSTIN PDF')} aria-label={`Upload GSTIN PDF for GSTIN ${index + 1}`}>
                                            <Paperclip size={13} />
                                            <span className="gstin-upload-text">Upload GSTIN</span>
                                            {(g.file || g.existingFileName) && <span className="gstin-upload-file"><FileText size={11} />{g.file ? g.file.name : g.existingFileName}</span>}
                                        </button>
                                    </div>
                                    <input ref={el => fileRefs.current[index] = el} className="hidden" type="file" accept=".pdf" onChange={e => handleGstinFileChange(index, e)} />
                                    {errors[`gstin_${index}_gstin`] && <small className="error">{errors[`gstin_${index}_gstin`]}</small>}
                                    {errors[`gstin_${index}_file`] && <small className="error">{errors[`gstin_${index}_file`]}</small>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="actions"><span className="secure"><ShieldCheck /> 256-bit encryption</span><div><button type="button" className="reset" onClick={reset}><RotateCcw /> Reset</button><button className="submit" disabled={loading}><Send />{loading ? 'Submitting...' : 'Submit Request'}</button></div></div>
        </form></main><footer>Copyright©2026. Designed and Developed by Centre for Railway Information Systems (CRIS)</footer>
    </div>;
}
