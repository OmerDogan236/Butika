// Store prices are held in hundredths. Only normalize an unambiguous local alias.
export function trackingCurrency(value: unknown): string | null {
  if (typeof value!=='string') return null;
  const raw=value.trim().toUpperCase(),currency=raw==='TL'?'TRY':raw;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  try{return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits===2?currency:null;}catch{return null;}
}
