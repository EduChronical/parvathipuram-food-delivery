export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_BASE = import.meta.env?.VITE_API_BASE_URL || '';

export async function api(path, { method = 'GET', token, body, signal, headers = {} } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,signal,
    headers:{accept:'application/json',...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`} : {}),...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  let payload=null;
  if(text){try{payload=JSON.parse(text);}catch{throw new ApiError(response.status,'INVALID_SERVER_RESPONSE','The server returned an unexpected response. Please try again later.');}}
  if(!response.ok) throw new ApiError(response.status,payload?.error?.code||'HTTP_ERROR',payload?.error?.message||`HTTP ${response.status}`,payload?.error?.details);
  return payload;
}

export async function download(path,{token,filename='report.csv'}={}){
  const response=await fetch(`${API_BASE}${path}`,{headers:{...(token?{authorization:`Bearer ${token}`}:{})}});
  if(!response.ok){
    const text=await response.text(); let payload;
    try{payload=JSON.parse(text);}catch{}
    throw new ApiError(response.status,payload?.error?.code||'HTTP_ERROR',payload?.error?.message||`HTTP ${response.status}`);
  }
  const blob=await response.blob();
  const disposition=response.headers.get('content-disposition')||'';
  const match=disposition.match(/filename="?([^";]+)"?/i);
  const name=match?.[1]||filename;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  return { filename:name,rowCount:Number(response.headers.get('x-report-row-count')||0) };
}

export function money(paise=0){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(paise)/100);}
export function qs(params){const s=new URLSearchParams();for(const [k,v] of Object.entries(params||{})){if(v!==''&&v!==undefined&&v!==null&&v!==false)s.set(k,String(v));}const x=s.toString();return x?`?${x}`:'';}
export function googleMapsDirectionsUrl(latitude,longitude){if(!Number.isFinite(Number(latitude))||!Number.isFinite(Number(longitude)))return null;return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}&travelmode=driving&dir_action=navigate`;}
