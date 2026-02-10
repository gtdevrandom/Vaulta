import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deriveKey, encryptData, decryptData } from "./crypto.js";

const firebaseConfig = {
  apiKey: "AIzaSyC237bcE2N-mf0-1PYVvF8Mhy1kYM5hvzs",
  authDomain: "vaulta-a5c5b.firebaseapp.com",
  projectId: "vaulta-a5c5b",
  storageBucket: "vaulta-a5c5b.firebasestorage.app",
  messagingSenderId: "727567661466",
  appId: "1:727567661466:web:b8f6b8628e2764796ea223",
  measurementId: "G-EEGJJ5C602"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let userKey = null;

// Enregistrement PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}

// DÉVERROUILLAGE
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Entrez votre mot de passe maître");

    const salt = new TextEncoder().encode("un-sel-fixe-pour-le-moment"); 
    
    try {
        userKey = await deriveKey(masterPass, salt);
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadPasswords();
    } catch (e) {
        alert("Erreur de clé");
    }
});

// AJOUT
document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userKey) return;

    const site = document.getElementById('site-input').value;
    const identifiant = document.getElementById('id-input').value;
    const motdepasse = document.getElementById('pass-input').value;

    try {
        const encrypted = await encryptData(motdepasse, userKey);
        await addDoc(collection(db, "passwords"), {
            site,
            identifiant,
            password: encrypted.cipher,
            iv: encrypted.iv,
            createdAt: Date.now()
        });
        document.getElementById('add-form').reset();
        loadPasswords();
    } catch (err) {
        alert('Erreur lors de l\'ajout');
    }
});

// CHARGEMENT & DÉCHIFFREMENT
async function loadPasswords() {
    const querySnapshot = await getDocs(collection(db, "passwords"));
    const list = document.getElementById('password-list');
    list.innerHTML = "";

    querySnapshot.forEach(async (docSnapshot) => {
        const data = docSnapshot.data();
        try {
            const clearPass = await decryptData(data.password, data.iv, userKey);
            list.innerHTML += `
                <div class="card">
                    <div>
                        <strong style="color:var(--primary)">${data.site}</strong><br>
                        <small>${data.identifiant}</small><br>
                        <code style="background:#000; padding:2px 5px;">${clearPass}</code>
                    </div>
                    <button class="delete-btn" onclick="deletePassword('${docSnapshot.id}')">🗑️</button>
                </div>`;
        } catch (e) {
            console.error("Erreur déchiffrement item");
        }
    });
}

// SUPPRESSION (Attachée à window pour le onclick du HTML)
window.deletePassword = async function(id) {
    if (!confirm("Supprimer cet élément ?")) return;
    try {
        await deleteDoc(doc(db, "passwords", id));
        loadPasswords();
    } catch (err) {
        alert('Erreur de suppression');
    }
};

// DÉCONNEXION
document.getElementById('logout-btn').addEventListener('click', () => {
    userKey = null;
    location.reload(); // Moyen le plus sûr de vider la mémoire vive
});
