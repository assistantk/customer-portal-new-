import { useEffect, useRef, useState, useCallback } from 'react';
import { Building2, Tag, MapPin, FileText, Globe, Mail, Phone, ShieldCheck, RotateCcw, Send, UserRound, ChevronDown, Plus, Loader2, CheckCircle2, AlertCircle, Users, Search, Trash2, Paperclip } from 'lucide-react';
import { getMasterData, lookupOldCustomerJDBC, lookupHandlingAgentJDBC, updateOldCustomerJDBC, generateUniqueCode, registerCustomer, lookupOwnershipJDBC, lookupOwnershipPartyJDBC, submitOwnershipJDBC } from '../services/customerService';
import { extractGstinFromFile } from '../utils/panOcr';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

const blank = { companyName: '', customerCode: '', address: '', city: '', pincode: '', panNumber: '', operatingDivision: '', zone: '', email: '', mobile: '', globalCustomerCode: '', handlingAgentCode: '', ownershipCode: '', ownershipAddress: '', ownershipPartyCode: '', ownershipPartyAddress: '' };
const blankGstin = { gstinId: null, state: '', stateCode: '', gstin: '', file: null, existingFileName: '', scanning: false, scanStatus: 'idle', scanError: '' };
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
const gstinRe = /^[A-Z0-9]{15}$/, panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/, mobileRe = /^[6-9][0-9]{9}$/;
const normalizeDocumentNumber = value => String(value || '').replace(/\s+/g, '').toUpperCase();
const getGstinPanStatus = (gstin, pan) => {
    const normalizedGstin = normalizeDocumentNumber(gstin);
    const normalizedPan = normalizeDocumentNumber(pan);
    if (!normalizedGstin) return null;
    if (!gstinRe.test(normalizedGstin)) return 'Enter a valid 15-character GSTIN.';
    if (normalizedPan.length !== 10 || !panRe.test(normalizedPan)) return null;
    return normalizedGstin.slice(2, 12) === normalizedPan ? 'GSTIN matches PAN' : 'GSTIN does not match the PAN number.';
};
const normalizeAddress = value => value.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP_WORDS = new Set(['pvt', 'ltd', 'limited', 'private', 'company', 'co', 'inc', 'llp', 'the', 'and', 'of', 'for', 'a', 'an', 'in', 'on', 'at', 'to', 'by', 'with', 'group', 'enterprises', 'solutions', 'services', 'industries', 'corporation', 'corp']);

const addressesMatch = (left, right) => {
    const a = normalizeAddress(left || '');
    const b = normalizeAddress(right || '');
    if (!a || !b) return false;
    const pinPattern = /\b[1-9][0-9]{5}\b/g;
    const leftPin = a.match(pinPattern)?.[0];
    const rightPin = b.match(pinPattern)?.[0];
    if (leftPin && rightPin && leftPin !== rightPin) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const aTokens = new Set(a.split(' ').filter(token => token.length > 2));
    const bTokens = new Set(b.split(' ').filter(token => token.length > 2));
    const overlap = [...aTokens].filter(token => bTokens.has(token)).length;
    return overlap / Math.max(aTokens.size, bTokens.size) >= 0.5;
};

function generateCodeFromName(name) {
    if (!name || !name.trim()) return '';
    const words = name.trim().split(/\s+/);
    const significant = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
    if (significant.length === 0) return words.map(w => w[0]).join('').toUpperCase();
    const parts = significant.map(w => (w === w.toUpperCase() && w.length <= 5) ? w : w[0]);
    return parts.join('').toUpperCase().slice(0, 8);
}

function Field({ label, name, icon: Icon, form, setForm, error, readOnly, optional = false, ...rest }) {
    return <div className="field"><label htmlFor={name}>{label}{optional ? ' (Optional)' : <> <b>*</b></>}</label><div className={'control ' + (error ? 'invalid' : '')}><Icon size={15} /><input id={name} name={name} value={form[name]} readOnly={readOnly} onChange={e => setForm({ ...form, [name]: e.target.value })} {...rest} /></div>{error && <small className="error">{error}</small>}</div>;
}
function Select({ label, name, icon: Icon, options, form, setForm, error, disabled, onValueChange, optional = false, formatOption = value => value }) {
    return <div className="field"><label htmlFor={name}>{label}{optional ? ' (Optional)' : <> <b>*</b></>}</label><div className={'control select ' + (error ? 'invalid' : '')}><Icon size={15} /><select id={name} value={form[name]} disabled={disabled} onChange={e => onValueChange ? onValueChange(e.target.value) : setForm({ ...form, [name]: e.target.value })}><option value="">Select {label.toLowerCase()}</option>{options.map(v => <option key={v} value={v}>{formatOption(v)}</option>)}</select><ChevronDown size={14} /></div>{error && <small className="error">{error}</small>}</div>;
}
function DivisionSelect({ options, form, setForm, error, disabled, optional = false }) {
    const [open, setOpen] = useState(false);
    const choose = division => { setForm(prev => ({ ...prev, operatingDivision: division })); setOpen(false); };
    const selectedDivision = options.includes(form.operatingDivision) ? form.operatingDivision : '';
    return <div className="field zone-field"><label id="division-label">Division{optional ? ' (Optional)' : <> <b>*</b></>}</label><button type="button" className={'control zone-trigger ' + (error ? 'invalid' : '')} aria-labelledby="division-label" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)}><Globe size={15} /><span>{selectedDivision || 'Select division'}</span><ChevronDown size={14} /></button>{open && <div className="zone-menu" role="listbox" aria-label="Division options"><button type="button" className="zone-option" onClick={() => choose('')}>Select division</button>{options.map(division => <button type="button" className="zone-option" role="option" aria-selected={form.operatingDivision === division} key={division} onClick={() => choose(division)}>{division}</button>)}</div>}{error && <small className="error">{error}</small>}</div>;
}

function ZoneSelect({ options, form, setForm, error, optional = false }) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const choose = zone => { setForm(prev => ({ ...prev, zone, operatingDivision: '' })); setSearchTerm(''); setOpen(false); };
    const toggleOpen = () => { setOpen(current => !current); if (open) setSearchTerm(''); };
    const filteredOptions = options.filter(zone => zone.toLowerCase().includes(searchTerm.toLowerCase()));
    return <div className="field zone-field"><label id="zone-label">Zone{optional ? ' (Optional)' : <> <b>*</b></>}</label><button type="button" className={'control zone-trigger ' + (error ? 'invalid' : '')} aria-labelledby="zone-label" aria-expanded={open} onClick={toggleOpen}><Globe size={15} /><span>{form.zone || 'Select zone'}</span><ChevronDown size={14} /></button>{open && <div className="zone-menu" role="listbox" aria-label="Zone options"><div className="zone-search"><Search size={14} /><input type="search" aria-label="Search zones" placeholder="Search zone" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div><button type="button" className="zone-option" onClick={() => choose('')}>Select zone</button>{filteredOptions.length ? filteredOptions.map(zone => <button type="button" className="zone-option" role="option" aria-selected={form.zone === zone} key={zone} onClick={() => choose(zone)}>{zone}</button>) : <div className="zone-empty">No zones found</div>}</div>}{error && <small className="error">{error}</small>}</div>;
}

export default function CustomerRegistration() {
    const [mode, setMode] = useState('old');
    const [codeType, setCodeType] = useState('GLOBAL');
    const [form, setForm] = useState(blank);
    const [gstins, setGstins] = useState([{ ...blankGstin }]);
    const [data, setData] = useState(initialMasterData);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupDone, setLookupDone] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [codeChecking, setCodeChecking] = useState(false);
    const [codeConfirmed, setCodeConfirmed] = useState(false);
    const [addressStatus, setAddressStatus] = useState('');
    const [ocrAutoFillApplied, setOcrAutoFillApplied] = useState(false);
    // Track GSTINs that were removed during an Old User edit session
    const [removedGstinIds, setRemovedGstinIds] = useState([]);
    const fileRefs = useRef([]);
    const formRef = useRef(form);
    const codeTimerRef = useRef(null);
    const lookupTimerRef = useRef(null);
    const lookupRequestRef = useRef(0);

    // ===== Ownership Section 1: MEMWGONOWNRSHIP (top form fields) =====
    const [ownSection1Loading, setOwnSection1Loading] = useState(false);
    const [ownSection1Found, setOwnSection1Found] = useState(null);
    const ownSection1TimerRef = useRef(null);
    const ownSection1ReqRef = useRef(0);

    // ===== Ownership Section 2: MEMWGONOWNRPRTY (bottom "Ownership Details" panel) =====
    const [ownSection2Loading, setOwnSection2Loading] = useState(false);
    const [ownSection2Found, setOwnSection2Found] = useState(null);
    const ownSection2TimerRef = useRef(null);
    const ownSection2ReqRef = useRef(0);

    useEffect(() => { getMasterData().then(setData).catch(() => { }) }, []);
    useEffect(() => { formRef.current = form; }, [form]);

    const reset = () => {
        setForm(blank); setGstins([{ ...blankGstin }]); setErrors({}); setNotice('');
        setLookupDone(false); setLookupError('');
        setCodeConfirmed(false); setCodeChecking(false); setCodeType('GLOBAL');
        setAddressStatus('');
        setOcrAutoFillApplied(false);
        setRemovedGstinIds([]);
        fileRefs.current.forEach(ref => { if (ref) ref.value = '' });
        // Reset ownership section states
        setOwnSection1Loading(false); setOwnSection1Found(null);
        setOwnSection2Loading(false); setOwnSection2Found(null);
    };

    const clearSelectedUploads = () => {
        setGstins(prev => prev.map(g => ({ ...g, file: null, scanning: false, scanStatus: 'idle', scanError: '' })));
        fileRefs.current.forEach(ref => { if (ref) ref.value = '' });
    };

    const switchMode = (newMode) => { reset(); setMode(newMode); };

    /* ===== Ownership Section 1: lookup in MEMWGONOWNRSHIP ===== */
    const handleOwnershipCodeChange = (code) => {
        setForm(prev => ({ ...prev, ownershipCode: code, ownershipAddress: '' }));
        setOwnSection1Found(null);
        const reqId = ++ownSection1ReqRef.current;
        if (ownSection1TimerRef.current) clearTimeout(ownSection1TimerRef.current);
        if (code.trim().length > 0) {
            setOwnSection1Loading(true);
            ownSection1TimerRef.current = setTimeout(async () => {
                try {
                    const resp = await lookupOwnershipJDBC(code.trim());
                    if (reqId !== ownSection1ReqRef.current) return;
                    if (resp && resp.found && resp.data) {
                        setForm(prev => ({
                            ...prev,
                            ownershipCode: code,
                            ownershipAddress: resp.data.ownershipDesc || '',
                        }));
                        setOwnSection1Found(true);
                    } else {
                        setOwnSection1Found(false);
                    }
                } catch (err) {
                    if (reqId !== ownSection1ReqRef.current) return;
                    setOwnSection1Found(false);
                } finally {
                    if (reqId === ownSection1ReqRef.current) setOwnSection1Loading(false);
                }
            }, 600);
        } else {
            setOwnSection1Loading(false);
        }
    };

    /* ===== Ownership Section 2: lookup in MEMWGONOWNRPRTY ===== */
    const handleOwnershipPartyCodeChange = (code) => {
        setForm(prev => ({ ...prev, ownershipPartyCode: code, ownershipPartyAddress: '' }));
        setOwnSection2Found(null);
        const reqId = ++ownSection2ReqRef.current;
        if (ownSection2TimerRef.current) clearTimeout(ownSection2TimerRef.current);
        if (code.trim().length > 0) {
            setOwnSection2Loading(true);
            ownSection2TimerRef.current = setTimeout(async () => {
                try {
                    const resp = await lookupOwnershipPartyJDBC(code.trim());
                    if (reqId !== ownSection2ReqRef.current) return;
                    if (resp && resp.found && resp.data) {
                        setForm(prev => ({
                            ...prev,
                            ownershipPartyCode: code,
                            ownershipPartyAddress: resp.data.partyDesc || '',
                        }));
                        setOwnSection2Found(true);
                    } else {
                        setOwnSection2Found(false);
                    }
                } catch (err) {
                    if (reqId !== ownSection2ReqRef.current) return;
                    setOwnSection2Found(false);
                } finally {
                    if (reqId === ownSection2ReqRef.current) setOwnSection2Loading(false);
                }
            }, 600);
        } else {
            setOwnSection2Loading(false);
        }
    };

    /* ===== Old User: lookup by customer / handling agent code ===== */
    const triggerOldLookup = (code, type) => {
        setForm(prev => ({
            ...prev,
            customerCode: code,
            companyName: '',
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
        }));
        setGstins([{ ...blankGstin }]);
        setLookupDone(false); setLookupError('');
        setAddressStatus('');
        const requestId = ++lookupRequestRef.current;
        if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
        if (code.trim().length === 4) {
            setLookupLoading(true);
            lookupTimerRef.current = setTimeout(async () => {
                try {
                    let customer;
                    if (type === 'HANDLING_AGENT') {
                        customer = await lookupHandlingAgentJDBC(code.trim());
                    } else {
                        customer = await lookupOldCustomerJDBC(code.trim());
                    }
                    if (requestId !== lookupRequestRef.current) return;
                    setForm(prev => ({
                        ...prev,
                        companyName: customer.companyName || '',
                        customerCode: code,
                        address: customer.address || '',
                        city: customer.city || '',
                        pincode: customer.pincode || '',
                        panNumber: customer.panNumber || '',
                        operatingDivision: '',
                        zone: '',
                        email: customer.email || customer.emailId || '',
                        mobile: customer.mobile || customer.phoneNumber || '',
                        globalCustomerCode: '',
                        handlingAgentCode: '',
                    }));
                    if (customer.gstinNumbers && customer.gstinNumbers.trim() !== '') {
                        const cleanGstins = customer.gstinNumbers.replace(/[\[\]"\s]/g, '');
                        const loadedGstins = cleanGstins.split(',').filter(Boolean).map((g, idx) => ({
                            ...blankGstin,
                            gstinId: `old-${idx}`, // temporary ID
                            gstin: g,
                        }));
                        setGstins(loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }]);
                    } else {
                        setGstins([{ ...blankGstin }]);
                    }

                    setRemovedGstinIds([]);
                    setLookupDone(true); setLookupError('');
                } catch (err) {
                    if (requestId !== lookupRequestRef.current) return;
                    console.error("Lookup error:", err);
                    setLookupDone(false);
                    setLookupError(err.message || 'Error occurred while fetching customer data');
                    setForm(prev => ({
                        ...prev,
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
                    }));
                    setGstins([{ ...blankGstin }]);
                } finally {
                    if (requestId === lookupRequestRef.current) setLookupLoading(false);
                }
            }, 800);
        } else {
            setLookupLoading(false);
            setGstins([{ ...blankGstin }]);
            setForm(prev => ({
                ...prev,
                companyName: '',
                address: '',
                city: '',
                panNumber: '',
                email: '',
                mobile: '',
            }));
        }
    };

    const handleOldCodeChange = (code) => {
        triggerOldLookup(code, codeType);
    };

    const handleOldCodeTypeChange = (newType) => {
        setCodeType(newType);
        if (form.customerCode.trim().length === 4) {
            triggerOldLookup(form.customerCode, newType);
        } else {
            setLookupDone(false);
            setLookupError('');
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
                } catch (err) {
                    console.error("Code verification error:", err);
                    setCodeConfirmed(false);
                    setLookupError("Verify failed: " + (err.message || 'Unknown error'));
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

    const checkFile = f => {
        if (!f) return 'GSTIN file is required';
        if (f.size > 5242880) return 'File size must not exceed 5MB';
        const extension = f.name.split('.').pop()?.toLowerCase();
        const supportedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!supportedTypes.includes(f.type) && !['pdf', 'jpg', 'jpeg', 'jpe', 'png'].includes(extension)) {
            return 'Only PDF, JPG, JPEG, and PNG files are allowed';
        }
        return '';
    };

    const validate = () => {
        let e = {};
        if (mode === 'ownership') {
            // Require both ownership records and their corresponding descriptions.
            if (!form.ownershipCode?.trim()) e.ownershipCode = 'Ownership Code is required';
            if (!form.ownershipAddress?.trim()) e.ownershipAddress = 'Ownership Address is required';
            if (!form.ownershipPartyCode?.trim()) e.ownershipPartyCode = 'Ownership Code is required';
            if (!form.ownershipPartyAddress?.trim()) e.ownershipPartyAddress = 'Ownership Address is required';
            setErrors(e);
            return !Object.keys(e).length;
        }
        // Required field checks - exclude globalCustomerCode/handlingAgentCode from required
        const requiredFields = ['companyName', 'customerCode', 'address', 'city', 'panNumber'];
        if (mode === 'new') requiredFields.push('operatingDivision', 'zone', 'pincode');
        requiredFields.forEach(k => { if (!form[k]) e[k] = 'This field is required' });
        if (form.address && form.address.length > 100) e.address = 'Address cannot exceed 100 characters.';
        if (form.email?.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Invalid email';
        if (form.mobile?.trim() && !mobileRe.test(form.mobile.trim())) e.mobile = 'Enter a valid 10-digit Indian mobile number';
        if (form.pincode && !/^[1-9][0-9]{5}$/.test(form.pincode)) e.pincode = 'Invalid pincode';
        const normalizedPan = normalizeDocumentNumber(form.panNumber);
        if (form.panNumber && !panRe.test(normalizedPan)) e.panNumber = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';

        if (mode !== 'ownership') {
            let stateSet = new Set();
            let gstinSet = new Set();
            gstins.forEach((g, i) => {
                if (!g.state && mode === 'new') e[`gstin_${i}_state`] = 'State is required';
                else if (g.state && stateSet.has(g.state)) e[`gstin_${i}_state`] = 'State already added';
                else if (g.state) stateSet.add(g.state);

                const normalizedGstin = normalizeDocumentNumber(g.gstin);
                if (!g.gstin) e[`gstin_${i}_gstin`] = 'GSTIN is required';
                else if (!gstinRe.test(normalizedGstin) || normalizedGstin.length !== 15) e[`gstin_${i}_gstin`] = 'Enter a valid 15-character GSTIN.';
                else if (gstinSet.has(normalizedGstin)) e[`gstin_${i}_gstin`] = 'GSTIN already added';
                else if (normalizedGstin.slice(2, 12) !== normalizedPan) e[`gstin_${i}_gstin`] = 'GSTIN does not match the PAN number.';
                else gstinSet.add(normalizedGstin);

                if (!g.file && !g.existingFileName && mode === 'new') {
                    e[`gstin_${i}_file`] = 'GSTIN file is required';
                } else if (g.file) {
                    const fe = checkFile(g.file);
                    if (fe) e[`gstin_${i}_file`] = fe;
                }
            });
        }

        if (mode === 'new' && !codeConfirmed && form.companyName) {
            if (codeChecking) {
                e.customerCode = 'Please wait - code is being verified';
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
            if (mode === 'ownership') {
                const result = await submitOwnershipJDBC(
                    form.ownershipCode.trim().toUpperCase(),
                    form.ownershipAddress?.trim() || '',
                    form.ownershipPartyCode?.trim().toUpperCase() || '',
                    form.ownershipPartyAddress?.trim() || ''
                );
                setNotice(result.message || 'Request email sent to DBA. Database changes are pending DBA execution.');
            } else if (mode === 'new') {
                /* --- New Entry: email the DBA's INSERT request --- */
                const result = await registerCustomer(
                    { ...form, codeType },
                    gstins
                );
                reset();
                setNotice(result.customerCode
                    ? `Request email sent to DBA. Database changes are pending DBA execution. Customer Code: ${result.customerCode}`
                    : (result.message || 'Request email sent to DBA. The database change is pending DBA execution.'));
            } else {
                /* --- Old User: email the DBA's UPDATE request --- */
                const result = await updateOldCustomerJDBC({ ...form, codeType }, gstins);

                clearSelectedUploads();
                setNotice(result.message || 'Request email sent to DBA. The database change is pending DBA execution.');
                setRemovedGstinIds([]);

                // Re-lookup to refresh data from DB
                try {
                    if (codeType === 'HANDLING_AGENT') {
                        const refreshed = await lookupHandlingAgentJDBC(form.customerCode.trim());
                        setForm(prev => ({
                            ...prev,
                            companyName: refreshed.companyName || prev.companyName,
                            address: refreshed.address || prev.address,
                            city: refreshed.city || prev.city,
                            panNumber: refreshed.panNumber || prev.panNumber,
                            email: refreshed.email || prev.email,
                            mobile: refreshed.mobile || prev.mobile,
                        }));

                        if (refreshed.gstinNumbers && refreshed.gstinNumbers.trim() !== '') {
                            const cleanGstins = refreshed.gstinNumbers.replace(/[\[\]"\s]/g, '');
                            const loadedGstins = cleanGstins.split(',').filter(Boolean).map((g, idx) => ({
                                ...blankGstin,
                                gstinId: `old-${idx}`, // temporary ID
                                gstin: g,
                            }));
                            setGstins(loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }]);
                        } else {
                            setGstins([{ ...blankGstin }]);
                        }
                    } else {
                        const refreshed = await lookupOldCustomerJDBC(form.customerCode.trim());
                        setForm(prev => ({
                            ...prev,
                            companyName: refreshed.companyName || prev.companyName,
                            address: refreshed.address || prev.address,
                            city: refreshed.city || prev.city,
                            panNumber: refreshed.panNumber || prev.panNumber,
                            email: refreshed.emailId || prev.email,
                            mobile: refreshed.phoneNumber || prev.mobile,
                        }));

                        if (refreshed.gstinNumbers && refreshed.gstinNumbers.trim() !== '') {
                            const cleanGstins = refreshed.gstinNumbers.replace(/[\[\]"\s]/g, '');
                            const loadedGstins = cleanGstins.split(',').filter(Boolean).map((g, idx) => ({
                                ...blankGstin,
                                gstinId: `old-${idx}`, // temporary ID
                                gstin: g,
                            }));
                            setGstins(loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }]);
                        } else {
                            setGstins([{ ...blankGstin }]);
                        }
                    }
                } catch (refreshErr) {
                    console.error("Refresh lookup error:", refreshErr);
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
        setGstins(prev => prev.map((gstin, currentIndex) => currentIndex === index ? { ...gstin, ...updates } : gstin));
        if (Object.prototype.hasOwnProperty.call(updates, 'gstin')) {
            const status = getGstinPanStatus(updates.gstin, form.panNumber);
            setErrors(prev => {
                const next = { ...prev };
                const field = `gstin_${index}_gstin`;
                if (status === 'GSTIN does not match the PAN number.') next[field] = 'GSTIN does not match the PAN number.';
                else if (status?.startsWith('Enter')) next[field] = status;
                else if (
                    ['GSTIN does not match the PAN number.', 'Enter a valid 15-character GSTIN.'].includes(next[field]) ||
                    next[field]?.includes('GSTIN could not be extracted') ||
                    next[field]?.includes('GSTIN could not be detected') ||
                    next[field]?.includes('valid 15-character GSTIN could not be extracted') ||
                    next[field]?.includes('extracted GSTIN contains an invalid PAN')
                ) delete next[field];
                return next;
            });
        }
    };
    const handlePanChange = value => {
        setForm(prev => ({ ...prev, panNumber: value }));
        setErrors(prev => {
            const next = { ...prev };
            const normalizedPan = normalizeDocumentNumber(value);
            if (value && !panRe.test(normalizedPan)) next.panNumber = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
            else if (next.panNumber?.startsWith('Enter a valid PAN')) delete next.panNumber;
            gstins.forEach((gstin, index) => {
                const status = getGstinPanStatus(gstin.gstin, value);
                    if (status === 'GSTIN does not match the PAN number.') next[`gstin_${index}_gstin`] = 'GSTIN does not match the PAN number.';
                else if (status?.startsWith('Enter')) next[`gstin_${index}_gstin`] = status;
                else if (['GSTIN does not match the PAN number.', 'Enter a valid 15-character GSTIN.'].includes(next[`gstin_${index}_gstin`])) delete next[`gstin_${index}_gstin`];
            });
            return next;
        });
    };
    const handleGstinFileChange = async (index, e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        const error = checkFile(selected);
        if (error) {
            handleGstinChange(index, { file: null, scanning: false, scanStatus: 'error', scanError: error });
            setErrors(prev => ({ ...prev, [`gstin_${index}_file`]: error }));
            return;
        }

        handleGstinChange(index, { file: selected, scanning: true, scanStatus: 'processing', scanError: '' });
        setErrors(prev => ({ ...prev, [`gstin_${index}_file`]: '' }));

        try {
            const { gstin, stateName, address, city, pincode, tradeName } = await extractGstinFromFile(selected);
            if (index === 0 && tradeName && !formRef.current.companyName.trim()) {
                if (mode === 'new') {
                    handleNewCompanyNameChange(tradeName);
                } else {
                    setForm(prev => prev.companyName.trim() ? prev : { ...prev, companyName: tradeName });
                }
                setOcrAutoFillApplied(true);
            }
            const normalizedGstin = normalizeDocumentNumber(gstin);
            const extractedPan = gstinRe.test(normalizedGstin) ? normalizedGstin.slice(2, 12) : '';
            if (!gstinRe.test(normalizedGstin)) {
                const message = 'A valid 15-character GSTIN could not be extracted. Please upload a clearer GSTIN document or enter the GSTIN manually.';
                handleGstinChange(index, { scanning: false, scanStatus: gstin ? 'error' : 'notfound', scanError: message });
                setErrors(prev => ({ ...prev, [`gstin_${index}_gstin`]: message }));
                return;
            }
            if (!panRe.test(extractedPan)) {
                const message = 'The extracted GSTIN contains an invalid PAN. Please upload a clearer GSTIN document or enter the GSTIN and PAN manually.';
                handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
                setErrors(prev => ({
                    ...prev,
                    panNumber: 'PAN could not be derived because the extracted GSTIN is invalid.',
                    [`gstin_${index}_gstin`]: message,
                }));
                return;
            }

            const updates = { gstin: normalizedGstin, scanning: false, scanStatus: 'success', scanError: '' };
            if (stateName && (!gstins[index]?.state || gstins[index]?.state === '')) {
                updates.state = stateName;
            }
            handleGstinChange(index, updates);
            setForm(prev => ({
                ...prev,
                panNumber: extractedPan,
                ...(index === 0 && city ? { city } : {}),
                ...(index === 0 && pincode ? { pincode } : {}),
            }));
            setOcrAutoFillApplied(true);
            setErrors(prev => {
                const next = { ...prev };
                delete next[`gstin_${index}_gstin`];
                delete next[`gstin_${index}_state`];
                delete next.panNumber;
                return next;
            });

            if (index === 0) {
                if (address) {
                    let shouldUpdate = true;
                    let isMatch = false;

                    if (form.address || form.city || form.pincode) {
                        isMatch = form.address ? addressesMatch(form.address, address) : false;
                        if (isMatch) {
                            shouldUpdate = false;
                            setAddressStatus('verified');
                        } else {
                            shouldUpdate = window.confirm(`Address found in GST Certificate:\n${address}\n\nUse this GST address instead of manually entered data?`);
                        }
                    }

                    if (shouldUpdate) {
                        setAddressStatus(!form.address ? 'auto-filled' : 'auto-corrected');
                        setForm(prev => {
                            let nextForm = { ...prev, address: address };
                            if (pincode) nextForm.pincode = pincode;
                            if (city) nextForm.city = city;
                            return nextForm;
                        });
                    } else if (!isMatch && form.address) {
                        // User chose not to auto-fill and it didn't match
                        setAddressStatus('');
                    }
                } else {
                    setAddressStatus('extraction-failed');
                }
            }
        } catch (err) {
            console.error('GSTIN OCR scan failed:', err);
            const message = err instanceof Error && err.message.startsWith('PDF exceeds the')
                ? `${err.message} Please upload a shorter PDF.`
                : 'GSTIN could not be extracted from this document. Please upload a clearer GSTIN document or enter the GSTIN manually.';
            handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
            setErrors(prev => ({
                ...prev,
                [`gstin_${index}_gstin`]: message
            }));
        }
    };

    const cities = Object.keys(data?.cities || {}), pins = form.city ? (data?.cities?.[form.city] || []) : [], zones = Object.keys(divisionsByZone), divisions = form.zone ? (divisionsByZone[form.zone] || []) : [];

    return (
        <main><form className={'card mode-' + mode} onSubmit={submit}>
            <div className="card-head">
                <div className="title-icon"><UserRound /><div>
                    <h1>Customer Registration</h1>
                    <p>{mode === 'ownership' ? 'Look up existing ownership record' : (mode === 'old' ? 'Look up existing customer record' : 'Register new customer account')}</p>
                </div></div>
                <div className="railways-banner"><img src={indianRailwaysLogo} alt="Indian Railways" /></div>
                <div className="mode-tabs">
                    <button type="button" className={'mode-tab mode-tab-ownership' + (mode === 'ownership' ? ' active' : '')} onClick={() => switchMode('ownership')}>
                        <Users size={14} /> Ownership
                    </button>
                    <button type="button" className={'mode-tab mode-tab-old' + (mode === 'old' ? ' active' : '')} onClick={() => switchMode('old')}>
                        <Users size={14} /> Old User
                    </button>
                    <button type="button" className={'mode-tab mode-tab-new' + (mode === 'new' ? ' active' : '')} onClick={() => switchMode('new')}>
                        <Plus size={14} /> New Entry
                    </button>
                </div>
            </div>

            {notice && <div className={notice.toLowerCase().includes('success') ? 'notice success' : 'notice'} role="alert">{notice}</div>}
            {mode === 'old' && lookupDone && <div className="info-banner"><CheckCircle2 size={16} /> Information loaded from previous registration. You may update fields and re-upload files before submitting.</div>}
            {mode === 'old' && lookupError && <div className="lookup-error"><AlertCircle size={14} /> {lookupError}</div>}

            {/* === State-wise GSTINs - hidden in ownership mode === */}
            {mode !== 'ownership' && (
                <div className="gstins-container state-gstins-container">
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
                                    <div className="field gstin-number-field">
                                        <label htmlFor={`gstin-${index}`}>GSTIN No. <b>*</b></label>
                                        <div className={'control gstin-control ' + (errors[`gstin_${index}_gstin`] || errors[`gstin_${index}_file`] ? 'invalid' : '')}>
                                            <FileText size={15} />
                                            <input id={`gstin-${index}`} name="gstin" value={g.gstin} maxLength="15" placeholder={g.scanning ? 'Extracting GSTIN...' : 'Enter GSTIN Number'} onChange={e => handleGstinChange(index, { gstin: e.target.value })} />
                                            <button type="button" className={'gstin-upload-btn' + (g.scanStatus === 'success' || g.file || g.existingFileName ? ' has-file' : '')} disabled={g.scanning} onClick={() => fileRefs.current[index]?.click()} title={g.file ? g.file.name : (g.existingFileName || 'Upload GSTIN Document')} aria-label={`Upload GSTIN for GSTIN ${index + 1}`}>
                                                <Paperclip size={13} />
                                                <span className="gstin-upload-text">{g.scanning ? 'Processing...' : (g.scanStatus === 'success' ? 'Uploaded' : (mode === 'old' ? 'Upload GSTIN (Optional)' : 'Upload GSTIN'))}</span>
                                                {(g.file || g.existingFileName) && <span className="gstin-upload-file"><FileText size={11} />{g.file ? g.file.name : g.existingFileName}</span>}
                                            </button>
                                        </div>
                                        <input ref={el => fileRefs.current[index] = el} className="hidden" type="file" accept=".pdf,.jpg,.jpeg,.jpe,.png" onChange={e => handleGstinFileChange(index, e)} />
                                        {g.scanning && <small className="gstin-scan-status scanning"><Loader2 size={12} className="spin" /> Extracting GSTIN...</small>}
                                        {!g.scanning && g.scanStatus === 'success' && <small className="gstin-scan-status success"><CheckCircle2 size={12} /> Uploaded - GSTIN auto-filled from document</small>}
                                        {!g.scanning && (g.scanStatus === 'notfound' || g.scanStatus === 'error') && <small className="gstin-scan-status warn"><AlertCircle size={12} /> GSTIN could not be detected. Please upload a clearer document or enter the GSTIN manually.</small>}
                                        {errors[`gstin_${index}_gstin`] && !['notfound', 'error'].includes(g.scanStatus) && <small className="error">{errors[`gstin_${index}_gstin`]}</small>}
                                        {!errors[`gstin_${index}_gstin`] && getGstinPanStatus(g.gstin, form.panNumber) === 'GSTIN matches PAN' && <small className="gstin-verified">{getGstinPanStatus(g.gstin, form.panNumber)}</small>}
                                        {!errors[`gstin_${index}_gstin`] && getGstinPanStatus(g.gstin, form.panNumber) === 'GSTIN does not match the PAN number.' && <small className="error">PAN number in GSTIN does not match the PAN entered above.</small>}
                                        {errors[`gstin_${index}_file`] && <small className="error">{errors[`gstin_${index}_file`]}</small>}
                                    </div>
                                    <Select label="State" name="state" icon={MapPin} options={INDIAN_STATES} form={g} onValueChange={val => handleGstinChange(index, { state: val })} error={errors[`gstin_${index}_state`]} optional={mode === 'old'} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="gstins-bottom-separator" aria-hidden="true" style={{ height: 0, borderTop: '1px solid #e5e7eb', width: '100%', margin: '12px 0 16px 0' }} />
                </div>
            )}

            {/* === Main Form: 3-column grid === */}
            <div className="grid">
                {/* Row 1: Code | Address/Name | PAN */}
                {(mode === 'old' || mode === 'ownership') && (
                    <div className="field">
                        <label htmlFor={mode === 'ownership' ? 'ownershipCode' : 'customerCode'}>
                            {mode === 'ownership' ? 'Ownership Code' : 'Customer Code'} <b>*</b>
                        </label>
                        {mode === 'old' && (
                            <div className="code-type-toggle">
                                <button type="button" className={'code-type-btn' + (codeType === 'GLOBAL' ? ' active' : '')} onClick={() => handleOldCodeTypeChange('GLOBAL')}><Globe size={13} /> Global Code</button>
                                <button type="button" className={'code-type-btn' + (codeType === 'HANDLING_AGENT' ? ' active' : '')} onClick={() => handleOldCodeTypeChange('HANDLING_AGENT')}><Users size={13} /> Handling Agent Code</button>
                            </div>
                        )}
                        <div className={'control ' + ((mode === 'ownership' ? errors.ownershipCode : errors.customerCode) ? 'invalid' : '')}>
                            <Tag size={15} />
                            <input
                                id={mode === 'ownership' ? 'ownershipCode' : 'customerCode'}
                                name={mode === 'ownership' ? 'ownershipCode' : 'customerCode'}
                                value={mode === 'ownership' ? (form.ownershipCode || '') : form.customerCode}
                                placeholder={mode === 'ownership' ? 'Enter ownership code' : (codeType === 'HANDLING_AGENT' ? 'Enter handling agent code' : 'Enter customer code')}
                                onChange={e => mode === 'ownership' ? handleOwnershipCodeChange(e.target.value) : handleOldCodeChange(e.target.value)}
                                style={{ textTransform: 'uppercase' }}
                                maxLength={4}
                            />
                            {mode === 'ownership' && ownSection1Loading && <Loader2 size={14} className="spin field-status" />}
                            {mode === 'ownership' && !ownSection1Loading && ownSection1Found === true && <CheckCircle2 size={14} className="field-status code-ok" title="Found in MEMWGONOWNRSHIP" />}
                            {mode === 'ownership' && !ownSection1Loading && ownSection1Found === false && <AlertCircle size={14} className="field-status" style={{ color: 'var(--warning,#ca8a04)' }} title="New code - will INSERT" />}
                            {mode !== 'ownership' && lookupLoading && <Loader2 size={14} className="spin field-status" />}
                            {mode !== 'ownership' && lookupDone && !lookupLoading && <CheckCircle2 size={14} className="field-status code-ok" />}
                        </div>
                        {mode === 'ownership' && errors.ownershipCode && <small className="error">{errors.ownershipCode}</small>}
                        {mode !== 'ownership' && errors.customerCode && <small className="error">{errors.customerCode}</small>}
                        {mode === 'ownership' && !errors.ownershipCode && ownSection1Found === true && <small style={{ color: 'var(--success,#16a34a)', fontSize: '0.78rem' }}>Record found in MEMWGONOWNRSHIP - address auto-filled.</small>}
                        {mode === 'ownership' && !errors.ownershipCode && ownSection1Found === false && <small style={{ color: 'var(--warning,#ca8a04)', fontSize: '0.78rem' }}>New code - will INSERT on submit.</small>}
                    </div>
                )}

                {mode === 'new' && (
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
                        {codeConfirmed && <small className="code-confirmed">{codeType === 'GLOBAL' ? 'Global' : 'Handling Agent'} Code "{form.customerCode}" is available</small>}
                        {lookupError && !codeConfirmed && mode === 'new' && <small className="error lookup-error"><AlertCircle size={13} /> {lookupError}</small>}
                        {errors.customerCode && <small className="error">{errors.customerCode}</small>}
                    </div>
                )}

                {mode === 'old' && (
                    <Field label="Company Name" name="companyName" icon={Building2} placeholder="Enter company name" form={form} setForm={setForm} error={errors.companyName} />
                )}
                {mode === 'ownership' && (
                    <div className="field">
                        <label htmlFor="ownershipAddress">Ownership Address <b>*</b></label>
                        <div className={'control ' + (errors.ownershipAddress ? 'invalid' : '')}>
                            <Building2 size={15} />
                            <input
                                id="ownershipAddress"
                                name="ownershipAddress"
                                value={form.ownershipAddress || ''}
                                placeholder="Enter ownership address"
                                onChange={e => setForm(prev => ({ ...prev, ownershipAddress: e.target.value }))}
                            />
                        </div>
                        {errors.ownershipAddress && <small className="error">{errors.ownershipAddress}</small>}
                    </div>
                )}
                {mode === 'new' && (
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
                    <label htmlFor="panNumber">PAN No.{mode === 'ownership' ? ' (Optional)' : <> <b>*</b></>}</label>
                    <div className={'control pan-control ' + (errors.panNumber ? 'invalid' : '')}>
                        <FileText size={15} />
                        <input id="panNumber" name="panNumber" value={form.panNumber} maxLength="10" placeholder="Enter 10-character PAN No." onChange={e => handlePanChange(e.target.value)} />
                    </div>
                    {errors.panNumber && <small className="error">{errors.panNumber}</small>}
                </div>

                {/* Row 2: Address | City | Pincode */}
                <div className="field">
                    <label htmlFor="address">Address{mode === 'ownership' ? ' (Optional)' : <> <b>*</b></>}</label>
                    <div className={'control ' + (errors.address ? 'invalid' : '')}>
                        <MapPin size={15} />
                        <input id="address" name="address" value={form.address} maxLength={100} placeholder="Enter complete business address" onChange={e => {
                            setForm({ ...form, address: e.target.value });
                            if (addressStatus) setAddressStatus('');
                            // Clear length error as user types back within limit
                            if (errors.address === 'Address cannot exceed 100 characters.' && e.target.value.length <= 100) {
                                setErrors(prev => { const next = { ...prev }; delete next.address; return next; });
                            }
                        }} />
                    </div>
                    {errors.address && <small className="error">{errors.address}</small>}
                    {!errors.address && (
                        <small style={{ color: form.address && form.address.length > 90 ? (form.address.length >= 100 ? 'var(--danger, #dc2626)' : 'var(--warning, #ca8a04)') : 'var(--muted, #6b7280)', fontSize: '0.75rem', marginTop: '2px', display: 'block', textAlign: 'right' }}>
                            {(form.address || '').length}/100 characters
                        </small>
                    )}
                    {!errors.address && addressStatus === 'verified' && <small className="address-status success" style={{ color: 'var(--success, #16a34a)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Verified against GSTIN document</small>}
                    {!errors.address && addressStatus === 'auto-filled' && <small className="address-status success" style={{ color: 'var(--success, #16a34a)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Auto-filled from GSTIN document</small>}
                    {!errors.address && addressStatus === 'auto-corrected' && <small className="address-status warn" style={{ color: 'var(--warning, #ca8a04)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12} /> Auto-corrected based on GSTIN document</small>}
                    {!errors.address && addressStatus === 'extraction-failed' && <small className="address-status error" style={{ color: 'var(--danger, #dc2626)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12} /> Unable to extract address from GSTIN PDF. Please verify manually.</small>}
                </div>
                <Field label="City" name="city" icon={MapPin} placeholder="Enter city" form={form} setForm={setForm} error={errors.city} optional={mode === 'ownership'} />
                <Field label="Pincode" name="pincode" icon={Mail} inputMode="numeric" maxLength="6" placeholder="Enter pincode" form={form} setForm={setForm} error={errors.pincode} optional={mode === 'old' || mode === 'ownership'} />

                {/* Row 3: Zone | Division | Email */}
                <ZoneSelect options={zones} form={form} setForm={setForm} error={errors.zone} optional={mode === 'old' || mode === 'ownership'} />
                <DivisionSelect options={divisions} form={form} setForm={setForm} error={errors.operatingDivision} disabled={!form.zone} optional={mode === 'old' || mode === 'ownership'} />
                <Field label="Email" name="email" icon={Mail} type="email" placeholder="Enter email address" form={form} setForm={setForm} error={errors.email} optional />

                {/* Row 4: Mobile */}
                <Field label="Mobile" name="mobile" icon={Phone} inputMode="numeric" maxLength="10" placeholder="Enter 10-digit number" form={form} setForm={setForm} error={errors.mobile} optional />
            </div>

            {/* === Ownership Details (Section 2: MEMWGONOWNRPRTY) - shown only in ownership mode === */}
            {mode === 'ownership' && (
                <div className="gstins-container">
                    <div className="gstins-header">
                        <h3>Ownership Details</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem 0' }}>
                        {/* Ownership Party Code */}
                        <div className="field">
                            <label htmlFor="ownershipPartyCode">Ownership Code <b>*</b></label>
                            <div className={'control ' + (errors.ownershipPartyCode ? 'invalid' : '')}>
                                <Tag size={15} />
                                <input
                                    id="ownershipPartyCode"
                                    name="ownershipPartyCode"
                                    value={form.ownershipPartyCode || ''}
                                    placeholder="Enter ownership code"
                                    onChange={e => handleOwnershipPartyCodeChange(e.target.value)}
                                    style={{ textTransform: 'uppercase' }}
                                />
                                {ownSection2Loading && <Loader2 size={14} className="spin field-status" />}
                                {!ownSection2Loading && ownSection2Found === true && <CheckCircle2 size={14} className="field-status code-ok" title="Found in MEMWGONOWNRPRTY" />}
                                {!ownSection2Loading && ownSection2Found === false && <AlertCircle size={14} className="field-status" style={{ color: 'var(--warning,#ca8a04)' }} title="New code - will INSERT" />}
                            </div>
                            {errors.ownershipPartyCode && <small className="error">{errors.ownershipPartyCode}</small>}
                            {!errors.ownershipPartyCode && ownSection2Found === true && <small style={{ color: 'var(--success,#16a34a)', fontSize: '0.78rem' }}>Record found in MEMWGONOWNRPRTY - address auto-filled.</small>}
                            {!errors.ownershipPartyCode && ownSection2Found === false && <small style={{ color: 'var(--warning,#ca8a04)', fontSize: '0.78rem' }}>New code - will INSERT on submit.</small>}
                        </div>

                        {/* Ownership Party Address */}
                        <div className="field">
                            <label htmlFor="ownershipPartyAddress">Ownership Address <b>*</b></label>
                            <div className={'control ' + (errors.ownershipPartyAddress ? 'invalid' : '')}>
                                <Building2 size={15} />
                                <input
                                    id="ownershipPartyAddress"
                                    name="ownershipPartyAddress"
                                    value={form.ownershipPartyAddress || ''}
                                    placeholder="Enter ownership address"
                                    onChange={e => setForm(prev => ({ ...prev, ownershipPartyAddress: e.target.value }))}
                                />
                            </div>
                            {errors.ownershipPartyAddress && <small className="error">{errors.ownershipPartyAddress}</small>}
                        </div>
                    </div>
                </div>
            )}

            {ocrAutoFillApplied && (
                <div className="info-banner" role="status">
                    <CheckCircle2 size={16} /> Please check the auto-filled details and verify that the information matches your uploaded document.
                </div>
            )}
            <div className="actions"><span className="secure"><ShieldCheck /> 256-bit encryption</span><div><button type="button" className="reset" onClick={reset}><RotateCcw /> Reset</button><button className="submit" disabled={loading}><Send />{loading ? 'Submitting...' : 'Submit Request'}</button></div></div>
        </form></main>
    );
}
