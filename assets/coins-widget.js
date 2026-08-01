/* ============================================================
   S3eeD Coins — ودجت مشترك لصفحات الألعاب المستقلة
   يستخدم نفس مشروع Firebase المستخدم بالصفحة الرئيسية وموقع FAN ART،
   فأي مستخدم مسجل دخول (Discord/Google) بيلاقي عملاته بنفس مكانه
   بغض النظر من أي صفحة لعب فيها.
   ============================================================ */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCjThTQY9XutIjTSs7T7PSutEl-Xoo3OII",
  authDomain: "s3as3-art.firebaseapp.com",
  projectId: "s3as3-art",
  storageBucket: "s3as3-art.firebasestorage.app",
  messagingSenderId: "438396515177",
  appId: "1:438396515177:web:a4eea1975abd0b3bcf83f8",
  measurementId: "G-TR67CYJJLW"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUid = null;
onAuthStateChanged(auth, (user)=>{ currentUid = user ? user.uid : null; });

function coinAssetPath(){
  // بعض صفحات الألعاب بمجلد فرعي، فنحاول نلاقي مسار assets/coin.png صح
  return "assets/coin.png";
}

function showCoinToast(amount){
  let el = document.getElementById("s3eedCoinToast");
  if(!el){
    el = document.createElement("div");
    el.id = "s3eedCoinToast";
    el.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-8px);z-index:99999;background:#2b2118;color:#f3e6c8;padding:10px 18px;border-radius:20px;font:700 14px/1.4 'Segoe UI',Tahoma,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;align-items:center;gap:8px;opacity:0;transition:opacity .25s ease, transform .25s ease;pointer-events:none;";
    el.innerHTML = `<img src="${coinAssetPath()}" style="width:20px;height:20px;object-fit:contain;" onerror="this.style.display='none'"><span class="s3eedCoinToastText"></span>`;
    document.body.appendChild(el);
  }
  el.querySelector(".s3eedCoinToastText").textContent = `+${amount} عملة 🪙`;
  el.style.opacity = "1";
  el.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(()=>{
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-8px)";
  }, 2600);
}

let lastAwardAt = 0;
window.awardGameCoins = async function(amount, gameId){
  if(!currentUid || !amount) return;
  const now = Date.now();
  if(now - lastAwardAt < 1500) return; // حماية بسيطة من استدعاء مضاعف لنفس اللحظة
  lastAwardAt = now;
  try{
    await runTransaction(db, async (trx)=>{
      const ref = doc(db, "users", currentUid);
      const snap = await trx.get(ref);
      const cur = snap.exists() ? (snap.data().coins||0) : 0;
      trx.set(ref, { coins: cur + amount }, { merge:true });
    });
    showCoinToast(amount);
  }catch(err){ console.error("awardGameCoins failed:", gameId, err); }
};
