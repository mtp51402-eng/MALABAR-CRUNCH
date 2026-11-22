# MALABAR CRUNCH — Wholesale & Retail Manager (PWA)

ഓഫ്‌ലൈനിൽ പ്രവർത്തിക്കുന്ന, ഇൻസ്റ്റാൾ ചെയ്യാവുന്ന ആപ്പ്. ഡാറ്റ ഫോണിൽ സേവ് ആകും; ഓൺലൈൻ ആകുമ്പോൾ Firebase-ലേക്ക് സ്വയം പോകും.

## ഹോസ്റ്റ് ചെയ്യാൻ (HTTPS നിർബന്ധം)
ഈ ഫോൾഡറിലെ ഫയലുകൾ GitHub Pages / Netlify / Cloudflare Pages / Firebase Hosting ഏതിലെങ്കിലും അപ്‌ലോഡ് ചെയ്യുക.
ആദ്യം ഓൺലൈനിൽ ഒരിക്കൽ തുറക്കുക → ബ്രൗസർ മെനുവിൽ "Install app / Add to Home Screen".

## Firebase
Realtime Database: `https://malabercrunch-default-rtdb.asia-southeast1.firebasedatabase.app`
ഡാറ്റ പാത: `malabar-crunch-v1/{items,suppliers,customers,purchases,sales,payments,settings}`

Rules (Firebase Console → Realtime Database → Rules):
```
{
  "rules": {
    ".read": false,
    ".write": false,
    "malabar-crunch-v1": { ".read": true, ".write": true }
  }
}
```
⚠️ ഇത് ആപ്പ് തുറക്കുന്ന ആർക്കും (വിലാസം അറിയുന്നവർക്ക്) ഡാറ്റ വായിക്കാനും മാറ്റാനും അനുവദിക്കും.
PIN ആപ്പിനുള്ളിലെ പരിരക്ഷ മാത്രമാണ്. ബില്ലും കടവും ഉള്ളതിനാൽ യഥാർത്ഥ ഉപയോഗത്തിന് Firebase Authentication ചേർക്കുന്നത് ശുപാർശ ചെയ്യുന്നു.

## ആദ്യ ലോഗിൻ
ഡിഫോൾട്ട് പിൻ: അഡ്മിൻ **1234**, പാർട്ണർ **0000** → ഉടൻ അഡ്മിൻ ടാബിൽ നിന്ന് മാറ്റുക.
