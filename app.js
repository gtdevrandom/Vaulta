import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deriveKey, encryptData, decryptData } from "./crypto.js";

// 1. Ta Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC237bcE2N-mf0-1PYVvF8Mhy1kYM5hvzs",
  authDomain: "vaulta-a5c5b.firebaseapp.com",
  projectId: "vaulta-a5c5b",
  storageBucket: "vaulta-a5c5b.firebasestorage.app",
  messagingSenderId: "727567661466",
  appId: "1:727567661466:web:b8f6b8628e2764796ea223",
  measurementId: "G-EEGJJ5C602"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let userKey = null; // Clé de chiffrement (reste en mémoire vive)

// Enregistrement du Service Worker pour la PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// Vérifier si la biométrie est disponible au chargement
if (window.PublicKeyCredential) {
    document.getElementById('biometric-btn').style.display = 'block';
}

// --- LOGIQUE DE DÉVERROUILLAGE ---

document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Entrez votre mot de passe maître");

    // SEL : Toujours le même pour générer la même clé à partir du même mdp
    const salt = new TextEncoder().encode("un-sel-fixe-pour-le-moment"); 
    
    try {
        // Dérivation de la clé AES à partir du mot de passe
        userKey = await deriveKey(masterPass, salt);
        
        // Affichage du dashboard
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        // Stockage temporaire pour la session biométrique
        sessionStorage.setItem('temp_master', masterPass);
        
        loadPasswords();
    } catch (e) {
        console.error(e);
        alert("Erreur de génération de clé.");
    }
});

// --- GESTION DES MOTS DE PASSE (FIRESTORE) ---

// Ajouter un mot de passe
document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userKey) return alert("Session expirée");

    const site = document.getElementById('site-input').value;
    const identifiant = document.getElementById('id-input').value;
    const motdepasse = document.getElementById('pass-input').value;

    try {
        // Chiffrement avant envoi
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
        console.error(err);
        alert('Erreur lors de l\'enregistrement sur Firebase');
    }
});

// Charger et déchiffrer la liste
async function loadPasswords() {
    const querySnapshot = await getDocs(collection(db, "passwords"));
    const list = document.getElementById('password-list');
    list.innerHTML = "";

    querySnapshot.forEach(async (docSnapshot) => {
        const data = docSnapshot.data();
        try {
            // Déchiffrement local avec la userKey
            const clearPass = await decryptData(data.password, data.iv, userKey);
            
            list.innerHTML += `
                <div class="card">
                    <div>
                        <strong style="color:var(--primary)">${data.site}</strong><br>
                        <small>${data.identifiant}</small><br>
                        <code style="background:#000; padding:2px 5px; color:#fff;">${clearPass}</code>
                    </div>
                    <button class="delete-btn" onclick="deletePassword('${docSnapshot.id}')">🗑️</button>
                </div>`;
        } catch (e) {
            console.error("Échec du déchiffrement pour un item (clé incorrecte ?)");
        }
    });
}

// Suppression (Globale pour le onclick)
window.deletePassword = async function(id) {
    if (!confirm("Supprimer cet élément ?")) return;
    try {
        await deleteDoc(doc(db, "passwords", id));
        loadPasswords();
    } catch (err) {
        alert('Erreur de suppression');
    }
};

// --- LOGIQUE BIOMÉTRIQUE (WEBAUTHN) ---

// Activer l'empreinte (doit être fait après un login réussi)
document.getElementById('enable-bio-btn').addEventListener('click', async () => {
    try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "Vaulta" },
                user: { id: window.crypto.getRandomValues(new Uint8Array(16)), name: "user", displayName: "User" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform" }
            }
        });

        if (credential) {
            localStorage.setItem('bio_enabled', 'true');
            alert("Empreinte liée à la session actuelle !");
        }
    } catch (e) {
        alert("Erreur biométrie : " + e.message);
    }
});

// Utiliser l'empreinte pour déverrouiller
document.getElementById('biometric-btn').addEventListener('click', async () => {
    const savedPass = sessionStorage.getItem('temp_master');
    if (!savedPass) {
        return alert("Veuillez vous connecter manuellement au moins une fois après avoir ouvert le navigateur.");
    }

    try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
            publicKey: { challenge, userVerification: "required" }
        });

        if (assertion) {
            document.getElementById('master-password').value = savedPass;
            document.getElementById('unlock-btn').click();
        }
    } catch (e) {
        alert("Authentification biométrique échouée ou annulée.");
    }
});

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', () => {
    userKey = null;
    sessionStorage.clear(); // Important : vide le mot de passe temporaire
    location.reload(); 
});
