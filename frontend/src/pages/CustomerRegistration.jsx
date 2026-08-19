import { useEffect, useRef, useState } from 'react';
import { Building2, Tag, MapPin, FileText, UploadCloud, Globe, Mail, Phone, ShieldCheck, RotateCcw, Send, UserRound, ChevronDown, Plus } from 'lucide-react';
import { getMasterData, registerCustomer } from '../services/customerService';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

const blank={companyName:'',customerCode:'',address:'',city:'',pincode:'',gstin:'',panNumber:'',operatingDivision:'',zone:'',email:'',mobile:''};
const initialMasterData={cities:{Delhi:['110001','110002'],Mumbai:['400001','400002'],Kolkata:['700001','700002'],Chennai:['600001','600002']},divisionZones:{'Northern Railway':['Delhi','Ambala','Firozpur','Lucknow','Moradabad'],'Eastern Railway':['Howrah','Sealdah','Asansol','Malda'],'Western Railway':['Mumbai Central','Vadodara','Ratlam','Ahmedabad','Rajkot','Bhavnagar'],'Southern Railway':['Chennai','Madurai','Palakkad','Salem','Thiruvananthapuram'],'Central Railway':['Mumbai','Bhusawal','Nagpur','Pune','Solapur'],'North Central Railway':['Prayagraj','Jhansi','Agra'],'South Central Railway':['Secunderabad','Hyderabad','Vijayawada','Guntakal','Nanded'],'North Eastern Railway':['Varanasi','Lucknow','Izzatnagar'],'North Western Railway':['Jaipur','Ajmer','Bikaner','Jodhpur']}};
const allZones=['Central Railway (Mumbai CSMT)','Eastern Railway (Kolkata)','East Central (Hajipur)','East Coast (Bhubaneswar)','Northern (Delhi)','North Central (Allahabad/Prayagraj)','North Eastern (Gorakhpur)','Northeast Frontier (Guwahati)','North Western (Jaipur)','Southern (Chennai)','South Central (Secunderabad)','South Coast (Visakhapatnam)','South Eastern (Kolkata)','South East Central (Bilaspur)','South Western (Hubballi)','Western (Mumbai Churchgate)','West Central (Jabalpur)','Kolkata Metro (newest Zone)'];
const divisionsByZone={
 'Central Railway (Mumbai CSMT)':['Mumbai (BB)','Bhusawal (BSL)','Nagpur (NGP)','Pune (PUNE)','Solapur (SUR)'],
 'Eastern Railway (Kolkata)':['Howrah (HWH)','Sealdah(SDAH)','Asansol (ASN)','Malda (MLDT)'],'East Central (Hajipur)':['Danapur (DNR)','Dhanbad (DHN)','Pt. Deen Dayal Upadhyaya (DDU)','Samastipur (SPJ)','Sonpur (SEE)'],'East Coast (Bhubaneswar)':['Khurda Road (KUR)','Sambalpur (SBP)','Waltair (WAT)' ,'Raygada (RGDA)'],'Northern (Delhi)':['Delhi (DLT)','Ambala (UMB)','Firozpur (FZR)','Lucknow (LKO)','Moradabad (MB)', 'JAMMU (JAT)'],
 'North Central (Allahabad/Prayagraj)':['Prayagraj (PRYJ)','Jhansi (JHS)','Agra (AGRA)'],'North Eastern (Gorakhpur)':['Varanasi','Lucknow','Izzatnagar'],'Northeast Frontier (Guwahati)':['Alipurduar','Katihar','Lumding','Rangiya','Tinsukia'],'North Western (Jaipur)':['Jaipur','Ajmer','Bikaner','Jodhpur'],'Southern (Chennai)':['Chennai','Madurai','Palakkad','Salem','Thiruvananthapuram'],'South Central (Secunderabad)':['Secunderabad','Hyderabad','Vijayawada','Guntakal','Nanded'],'South Coast (Visakhapatnam)':['Vijayawada','Waltair','Guntur'],'South Eastern (Kolkata)':['Adra','Chakradharpur','Kharagpur','Ranchi'],'South East Central (Bilaspur)':['Bilaspur','Nagpur','Raipur'],'South Western (Hubballi)':['Bengaluru','Hubballi','Mysuru'],'Western (Mumbai Churchgate)':['Mumbai Central','Vadodara','Ratlam','Ahmedabad','Rajkot','Bhavnagar'],'West Central (Jabalpur)':['Jabalpur','Bhopal','Kota'],'Kolkata Metro (newest Zone)':['Kolkata Metro']};
const gstin=/^[A-Za-z0-9]{15}$/,panNumber=/^[A-Za-z0-9]{10}$/,mobile=/^[6-9][0-9]{9}$/;
function Field({label,name,icon:Icon,form,setForm,error,...rest}) {
 return <div className="field"><label htmlFor={name}>{label} <b>*</b></label><div className={'control '+(error?'invalid':'')}><Icon size={15}/><input id={name} name={name} value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})} {...rest}/></div>{error&&<small className="error">{error}</small>}</div>;
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
    const [form, setForm] = useState(blank), [file, setFile] = useState(null), [data, setData] = useState(initialMasterData), [errors, setErrors] = useState({}), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false); const fileRef = useRef();
    useEffect(() => { getMasterData().then(setData).catch(() => { }) }, []);
    const reset = () => { setForm(blank); setFile(null); setErrors({}); setNotice(''); if (fileRef.current) fileRef.current.value = '' };
    const checkFile = f => { if (!f) return 'GSTIN file is required'; if (f.size > 5242880) return 'File size must not exceed 5MB'; if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) return 'Only PDF, JPG and PNG files are allowed'; return '' };
    const validate = () => { let e = {}; Object.entries(form).forEach(([k, v]) => { if (!v) e[k] = 'This field is required' }); if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Invalid email'; if (form.mobile && !mobile.test(form.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number'; if (form.pincode && !/^[1-9][0-9]{5}$/.test(form.pincode)) e.pincode = 'Invalid pincode'; if (form.gstin && !gstin.test(form.gstin)) e.gstin = 'GSTIN must contain exactly 15 letters or numbers'; if (form.panNumber && !panNumber.test(form.panNumber)) e.panNumber = 'PAN No. must contain exactly 10 letters or numbers'; const fileError = checkFile(file); if (fileError) e.file = fileError; setErrors(e); return !Object.keys(e).length };
    const submit = async e => { e.preventDefault(); setNotice(''); if (!validate()) return; setLoading(true); try { const result = await registerCustomer(form, file); setNotice(result.message); setForm(blank); setFile(null); fileRef.current.value = '' } catch (error) { setNotice(error.message) } finally { setLoading(false) } };
    const chooseFile = e => { const selected = e.target.files[0], error = checkFile(selected); setFile(error ? null : selected); setErrors({ ...errors, file: error }); };
    const cities = Object.keys(data.cities || {}), pins = form.city ? (data.cities?.[form.city] || []) : [], zones = data.zones?.length ? data.zones : allZones, divisions = form.zone ? (divisionsByZone[form.zone] || []) : [];
    return <div className="app">
        <header>
            <div className="brand">
                <div className="seal left-cris">
                    <img src={crisLogo} alt="CRIS – making IT happen" />
                </div>
                <span>CUSTOMER REGISTRATION PORTAL</span>
            </div>
            <div className="cris">
                <img src={crisLogo} alt="CRIS – making IT happen" />
            </div>
        </header>
        

        <div className="railways-banner">
            <img src={indianRailwaysLogo} alt="Indian Railways" />
        </div>

        <main><form className="card" onSubmit={submit}>
            <div className="card-head"><div className="title-icon"><UserRound /><div><h1>Customer Registration</h1><p>Enter customer account information</p></div></div><button type="button" className="new" onClick={reset}><Plus size={16} /> New Entry</button></div><div className="rule" />
            {notice && <div className={notice.includes('success') ? 'notice success' : 'notice'} role="alert">{notice}</div>}
            <div className="grid">
                <Field label="Company Name" name="companyName" icon={Building2} placeholder="Enter company name" form={form} setForm={setForm} error={errors.companyName} />
                <Field label="Customer Code" name="customerCode" icon={Tag} placeholder="Enter customer code" form={form} setForm={setForm} error={errors.customerCode} />
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
