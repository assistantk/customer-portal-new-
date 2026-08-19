import { useEffect, useRef, useState, useCallback } from 'react';
import { Building2, Tag, MapPin, FileText, UploadCloud, Globe, Mail, Phone, ShieldCheck, RotateCcw, Send, UserRound, ChevronDown, Plus, Loader2, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { getMasterData, registerCustomer, lookupCustomer, generateUniqueCode } from '../services/customerService';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

const blank = { companyName: '', customerCode: '', address: '', city: '', pincode: '', gstin: '', panNumber: '', operatingDivision: '', zone: '', email: '', mobile: '' };
const initialMasterData = { cities: { Delhi: ['110001', '110002'], Mumbai: ['400001', '400002'], Kolkata: ['700001', '700002'], Chennai: ['600001', '600002'] }, divisionZones: { 'Northern Railway': ['Delhi', 'Ambala', 'Firozpur', 'Lucknow', 'Moradabad'], 'Eastern Railway': ['Howrah', 'Sealdah', 'Asansol', 'Malda'], 'Western Railway': ['Mumbai Central', 'Vadodara', 'Ratlam', 'Ahmedabad', 'Rajkot', 'Bhavnagar'], 'Southern Railway': ['Chennai', 'Madurai', 'Palakkad', 'Salem', 'Thiruvananthapuram'], 'Central Railway': ['Mumbai', 'Bhusawal', 'Nagpur', 'Pune', 'Solapur'], 'North Central Railway': ['Prayagraj', 'Jhansi', 'Agra'], 'South Central Railway': ['Secunderabad', 'Hyderabad', 'Vijayawada', 'Guntakal', 'Nanded'], 'North Eastern Railway': ['Varanasi', 'Lucknow', 'Izzatnagar'], 'North Western Railway': ['Jaipur', 'Ajmer', 'Bikaner', 'Jodhpur'] } };
const allZones = ['Central Railway (Mumbai CSMT)', 'Eastern Railway (Kolkata)', 'East Central (Hajipur)', 'East Coast (Bhubaneswar)', 'Northern (Delhi)', 'North Central (Allahabad/Prayagraj)', 'North Eastern (Gorakhpur)', 'Northeast Frontier (Guwahati)', 'North Western (Jaipur)', 'Southern (Chennai)', 'South Central (Secunderabad)', 'South Coast (Visakhapatnam)', 'South Eastern (Kolkata)', 'South East Central (Bilaspur)', 'South Western (Hubballi)', 'Western (Mumbai Churchgate)', 'West Central (Jabalpur)', 'Kolkata Metro (newest Zone)'];
const divisionsByZone = { 'Central Railway (Mumbai CSMT)': ['Mumbai', 'Bhusawal', 'Nagpur', 'Pune', 'Solapur'], 'Eastern Railway (Kolkata)': ['Howrah', 'Sealdah', 'Asansol', 'Malda'], 'East Central (Hajipur)': ['Danapur', 'Dhanbad', 'Pt. Deen Dayal Upadhyaya', 'Samastipur', 'Sonpur'], 'East Coast (Bhubaneswar)': ['Khurda Road', 'Sambalpur', 'Waltair'], 'Northern (Delhi)': ['Delhi', 'Ambala', 'Firozpur', 'Lucknow', 'Moradabad'], 'North Central (Allahabad/Prayagraj)': ['Prayagraj', 'Jhansi', 'Agra'], 'North Eastern (Gorakhpur)': ['Varanasi', 'Lucknow', 'Izzatnagar'], 'Northeast Frontier (Guwahati)': ['Alipurduar', 'Katihar', 'Lumding', 'Rangiya', 'Tinsukia'], 'North Western (Jaipur)': ['Jaipur', 'Ajmer', 'Bikaner', 'Jodhpur'], 'Southern (Chennai)': ['Chennai', 'Madurai', 'Palakkad', 'Salem', 'Thiruvananthapuram'], 'South Central (Secunderabad)': ['Secunderabad', 'Hyderabad', 'Vijayawada', 'Guntakal', 'Nanded'], 'South Coast (Visakhapatnam)': ['Vijayawada', 'Waltair', 'Guntur'], 'South Eastern (Kolkata)': ['Adra', 'Chakradharpur', 'Kharagpur', 'Ranchi'], 'South East Central (Bilaspur)': ['Bilaspur', 'Nagpur', 'Raipur'], 'South Western (Hubballi)': ['Bengaluru', 'Hubballi', 'Mysuru'], 'Western (Mumbai Churchgate)': ['Mumbai Central', 'Vadodara', 'Ratlam', 'Ahmedabad', 'Rajkot', 'Bhavnagar'], 'West Central (Jabalpur)': ['Jabalpur', 'Bhopal', 'Kota'], 'Kolkata Metro (newest Zone)': ['Kolkata Metro'] };
const gstinRe = /^[A-Za-z0-9]{15}$/, panRe = /^[A-Za-z0-9]{10}$/, mobileRe = /^[6-9][0-9]{9}$/;
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
function Select({ label, name, icon: Icon, options, form, setForm, error, disabled, onValueChange }) {
    return <div className="field"><label htmlFor={name}>{label} <b>*</b></label><div className={'control select ' + (error ? 'invalid' : '')}><Icon size={15} /><select id={name} value={form[name]} disabled={disabled} onChange={e => onValueChange ? onValueChange(e.target.value) : setForm({ ...form, [name]: e.target.value })}><option value="">Select {label.toLowerCase()}</option>{options.map(v => <option key={v} value={v}>{v}</option>)}</select><ChevronDown size={14} /></div>{error && <small className="error">{error}</small>}</div>;
}
function ZoneSelect({ options, form, setForm, error }) {
    const [open, setOpen] = useState(false);
    const choose = zone => { setForm(prev => ({ ...prev, zone, operatingDivision: '' })); setOpen(false); };
    return <div className="field zone-field"><label id="zone-label">Zone <b>*</b></label><button type="button" className={'control zone-trigger ' + (error ? 'invalid' : '')} aria-labelledby="zone-label" aria-expanded={open} onClick={() => setOpen(!open)}><Globe size={15} /><span>{form.zone || 'Select zone'}</span><ChevronDown size={14} /></button>{open && <div className="zone-menu" role="listbox" aria-label="Zone options"><button type="button" className="zone-option" onClick={() => choose('')}>Select zone</button>{options.map(zone => <button type="button" className="zone-option" role="option" aria-selected={form.zone === zone} key={zone} onClick={() => choose(zone)}>{zone}</button>)}</div>}{error && <small className="error">{error}</small>}</div>;
}

export default function CustomerRegistration() {
    const [mode, setMode] = useState('old');
    const [codeType, setCodeType] = useState('GLOBAL');
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const [data, setData] = useState(initialMasterData);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    // Old User lookup state
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupDone, setLookupDone] = useState(false);
    const [lookupError, setLookupError] = useState('');
    // New Entry code generation state
    const [codeChecking, setCodeChecking] = useState(false);
    const [codeConfirmed, setCodeConfirmed] = useState(false);
    const fileRef = useRef();
    const codeTimerRef = useRef(null);
    const lookupTimerRef = useRef(null);

    useEffect(() => { getMasterData().then(setData).catch(() => { }) }, []);

    const reset = () => {
        setForm(blank); setFile(null); setErrors({}); setNotice('');
        setLookupDone(false); setLookupError('');
        setCodeConfirmed(false); setCodeChecking(false); setCodeType('GLOBAL');
        if (fileRef.current) fileRef.current.value = '';
    };

    const switchMode = (newMode) => { reset(); setMode(newMode); };

    // --- Old User: lookup when Customer Code changes ---
    const handleOldCodeChange = (code) => {
        setForm(prev => ({ ...prev, customerCode: code }));
        setLookupDone(false);
        setLookupError('');
        if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
        if (code.trim().length >= 2) {
            setLookupLoading(true);
            lookupTimerRef.current = setTimeout(async () => {
                try {
                    const customer = await lookupCustomer(code.trim());
                    setForm({
                        companyName: customer.companyName || '',
                        customerCode: customer.customerCode || code,
                        address: customer.address || '',
                        city: customer.city || '',
                        pincode: customer.pincode || '',
                        gstin: customer.gstin || '',
                        panNumber: customer.panNumber || '',
                        operatingDivision: customer.operatingDivision || '',
                        zone: customer.zone || '',
                        email: customer.email || '',
                        mobile: customer.mobile || '',
                    });
                    setLookupDone(true);
                    setLookupError('');
                } catch {
                    setLookupDone(false);
                    setLookupError('Customer Code not found. Please check the code or register as a New User.');
                } finally {
                    setLookupLoading(false);
                }
            }, 800);
        } else {
            setLookupLoading(false);
        }
    };

    // --- New Entry: auto-generate code from company name ---
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
                    const unique = await generateUniqueCode(code);
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
    }, []);

    const checkFile = f => { if (!f) return 'GSTIN file is required'; if (f.size > 5242880) return 'File size must not exceed 5MB'; if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) return 'Only PDF, JPG and PNG files are allowed'; return '' };

    const validate = () => {
        let e = {};
        Object.entries(form).forEach(([k, v]) => { if (!v) e[k] = 'This field is required' });
        if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Invalid email';
        if (form.mobile && !mobileRe.test(form.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number';
        if (form.pincode && !/^[1-9][0-9]{5}$/.test(form.pincode)) e.pincode = 'Invalid pincode';
        if (form.gstin && !gstinRe.test(form.gstin)) e.gstin = 'GSTIN must contain exactly 15 letters or numbers';
        if (form.panNumber && !panRe.test(form.panNumber)) e.panNumber = 'PAN No. must contain exactly 10 letters or numbers';
        const fileError = checkFile(file);
        if (fileError) e.file = fileError;
        if (mode === 'new' && !codeConfirmed && form.companyName) e.customerCode = 'Please wait — code is being verified';
        setErrors(e);
        return !Object.keys(e).length;
    };

    const submit = async e => {
        e.preventDefault(); setNotice('');
        if (!validate()) return;
        setLoading(true);
        try {
            const payload = { ...form, codeType: mode === 'new' ? codeType : 'GLOBAL' };
            const result = await registerCustomer(payload, file);
            setNotice(result.message);
            reset();
        } catch (error) { setNotice(error.message) } finally { setLoading(false) }
    };

    const chooseFile = e => { const selected = e.target.files[0], error = checkFile(selected); setFile(error ? null : selected); setErrors({ ...errors, file: error }); };
    const cities = Object.keys(data.cities || {}), pins = form.city ? (data.cities?.[form.city] || []) : [], zones = data.zones?.length ? data.zones : allZones, divisions = form.zone ? (divisionsByZone[form.zone] || []) : [];

    return <div className="app">
        <header>
            <div className="brand">
                <div className="seal left-cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
                <span>CUSTOMER REGISTRATION PORTAL</span>
            </div>
            <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
        </header>

        <div className="railways-banner"><img src={indianRailwaysLogo} alt="Indian Railways" /></div>

        <main><form className="card" onSubmit={submit}>
            <div className="card-head">
                <div className="title-icon"><UserRound /><div>
                    <h1>Customer Registration</h1>
                    <p>{mode === 'old' ? 'Look up existing customer record' : 'Register new customer account'}</p>
                </div></div>
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

            {notice && <div className={notice.includes('success') ? 'notice success' : 'notice'} role="alert">{notice}</div>}

            {/* Info banner when old user data is loaded */}
            {mode === 'old' && lookupDone && <div className="info-banner"><CheckCircle2 size={16} /> Information loaded from previous registration. You may update details before re-submitting.</div>}

            {/* Lookup error for old user */}
            {mode === 'old' && lookupError && <div className="lookup-error"><AlertCircle size={14} /> {lookupError}</div>}

            <div className="grid">
                {/* Customer Code — always first */}
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
                            <button type="button" className={'code-type-btn' + (codeType === 'GLOBAL' ? ' active' : '')} onClick={() => setCodeType('GLOBAL')}>
                                <Globe size={13} /> Global Code
                            </button>
                            <button type="button" className={'code-type-btn' + (codeType === 'HANDLING_AGENT' ? ' active' : '')} onClick={() => setCodeType('HANDLING_AGENT')}>
                                <Users size={13} /> Handling Agent Code
                            </button>
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

                {/* Company Name — second */}
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

                <div className="full"><Field label="Address" name="address" icon={MapPin} placeholder="Enter complete business address" form={form} setForm={setForm} error={errors.address} /></div>
                <Select label="City" name="city" icon={MapPin} options={cities} form={form} setForm={setForm} onValueChange={city => setForm(prev => ({ ...prev, city, pincode: '' }))} error={errors.city} />
                <Select label="Pincode" name="pincode" icon={Mail} options={pins} form={form} setForm={setForm} error={errors.pincode} disabled={!form.city} />
                <Field label="GSTIN" name="gstin" icon={FileText} maxLength="15" placeholder="Enter 15-character GSTIN" form={form} setForm={setForm} error={errors.gstin} />
                <Field label="PAN No." name="panNumber" icon={FileText} maxLength="10" placeholder="Enter 10-character PAN No." form={form} setForm={setForm} error={errors.panNumber} />
                <ZoneSelect options={zones} form={form} setForm={setForm} error={errors.zone} />
                <Select label="Division" name="operatingDivision" icon={Globe} options={divisions} form={form} setForm={setForm} error={errors.operatingDivision} disabled={!form.zone} />
                <div className="field"><label>Upload GSTIN File <b>*</b></label><button type="button" className={'dropzone ' + (errors.file ? 'drop-error' : '')} onClick={() => fileRef.current.click()}><UploadCloud /><span>Drag and drop your file here, or <a>browse</a><br /><small>{file ? file.name : 'PDF, JPG, PNG (Max 5MB)'}</small></span></button><input ref={fileRef} className="hidden" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={chooseFile} />{errors.file && <small className="error">{errors.file}</small>}</div>
                <div></div>
                <Field label="Email" name="email" icon={Mail} type="email" placeholder="Enter email address" form={form} setForm={setForm} error={errors.email} />
                <Field label="Mobile" name="mobile" icon={Phone} inputMode="numeric" maxLength="10" placeholder="Enter 10-digit number" form={form} setForm={setForm} error={errors.mobile} />
            </div>
            <div className="actions"><span className="secure"><ShieldCheck /> 256-bit encryption</span><div><button type="button" className="reset" onClick={reset}><RotateCcw /> Reset</button><button className="submit" disabled={loading}><Send />{loading ? 'Submitting...' : 'Submit Request'}</button></div></div>
        </form></main><footer>Copyright©2026. Designed and Developed by Centre for Railway Information Systems (CRIS)</footer>
    </div>;
}
