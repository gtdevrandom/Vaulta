import { deriveKey, encryptData, decryptData } from './crypto.js';

let userKey = null;

// --- 1. UTILITAIRES INDEXEDDB ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("VaultaDB", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("settings");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToPermanentStorage(key, value) {
    const db = await openDB();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(value, key);
    return new Promise((resolve) => tx.oncomplete = resolve);
}

async function getFromPermanentStorage(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const request = db.transaction("settings").objectStore("settings").get(key);
        request.onsuccess = () => resolve(request.result);
    });
}

// --- 2. LOGIQUE DE DÉVERROUILLAGE ---
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Entrez votre mot de passe maître");

    const salt = new TextEncoder().encode("salt-fixe-v1-vaulta-app"); 
    
    try {
        userKey = await deriveKey(masterPass, salt);
        
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        loadPasswords();
        
        const bioEnabled = localStorage.getItem('bio_enabled');
        if (bioEnabled === 'true') {
             document.getElementById('enable-bio-btn').style.display = 'none';
        }

    } catch (e) {
        console.error(e);
        alert("Erreur lors de la génération des clés.");
    }
});

// --- 3. GESTION DES MOTS DE PASSE ---
document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userKey) return alert("Session expirée. Veuillez recharger.");

    const site = document.getElementById('site-input').value;
    const username = document.getElementById('id-input').value;
    const password = document.getElementById('pass-input').value;

    const dataObj = { site, username, password, date: new Date().toISOString() };
    const jsonStr = JSON.stringify(dataObj);

    try {
        const encrypted = await encryptData(jsonStr, userKey);
        const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');
        vault.push(encrypted);
        localStorage.setItem('vault_data', JSON.stringify(vault));

        e.target.reset();
        loadPasswords();
    } catch (err) {
        alert("Erreur de chiffrement : " + err.message);
    }
});

async function loadPasswords() {
    const listContainer = document.getElementById('password-list');
    listContainer.innerHTML = '';

    const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');

    if (vault.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; opacity:0.6;">Aucun mot de passe sécurisé.</p>';
        return;
    }

    for (let i = 0; i < vault.length; i++) {
        const item = vault[i];
        try {
            const decryptedJson = await decryptData(item.cipher, item.iv, userKey);
            const entry = JSON.parse(decryptedJson);

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div style="overflow:hidden;">
                    <strong style="color:var(--primary); font-size:1.1em;">${entry.site}</strong><br>
                    <span style="font-size:0.9em; opacity:0.8;">${entry.username}</span>
                </div>
                <div style="display:flex; gap:5px;">
                     <button class="copy-btn" style="background:#475569; width:auto; padding:5px 10px;">📋</button>
                     <button class="del-btn" style="background:var(--danger); width:auto; padding:5px 10px;">🗑️</button>
                </div>
            `;
            
            card.querySelector('.copy-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(entry.password);
                alert('Mot de passe copié !');
            });

            card.querySelector('.del-btn').addEventListener('click', () => {
                if(confirm('Supprimer cet identifiant ?')) {
                    deleteEntry(i);
                }
            });

            listContainer.appendChild(card);
        } catch (err) {
            console.error("Échec déchiffrement index " + i, err);
        }
    }
}

function deleteEntry(index) {
    const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');
    vault.splice(index, 1);
    localStorage.setItem('vault_data', JSON.stringify(vault));
    loadPasswords();
}

// --- 4. BIOMÉTRIE (WebAuthn) - Version Corrigée ---
window.addEventListener('load', async () => {
    const bioEnabled = localStorage.getItem('bio_enabled');
    if (bioEnabled === 'true') {
        document.getElementById('biometric-login-btn').style.display = 'block';
    }
});

document.getElementById('enable-bio-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    
    if(!masterPass) {
        return alert("Veuillez d'abord vous connecter avec votre mot de passe.");
    }

    try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const userId = window.crypto.getRandomValues(new Uint8Array(16));

        const publicKey = {
            challenge: challenge,
            rp: { 
                name: "Vaulta App",
                id: window.location.hostname 
            },
            user: {
                id: userId,
                name: "user@vaulta",
                displayName: "Utilisateur Vaulta"
            },
            pubKeyCredParams: [
                { alg: -7, type: "public-key" },
                { alg: -257, type: "public-key" }
            ],
            authenticatorSelection: { 
                authenticatorAttachment: "platform", 
                userVerification: "preferred", // Plus compatible sur Android
                residentKey: "preferred"
            },
            timeout: 60000
        };

        const credential = await navigator.credentials.create({ publicKey });

        if (credential) {
            await saveToPermanentStorage('master_vault', masterPass);
            localStorage.setItem('bio_enabled', 'true');
            alert("Biométrie activée !");
            document.getElementById('enable-bio-btn').style.display = 'none';
        }
    } catch (e) {
        console.error(e);
        alert("Erreur biométrie : " + e.message);
    }
});

document.getElementById('biometric-login-btn').addEventListener('click', async () => {
    try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
            publicKey: { 
                challenge: challenge,
                userVerification: "preferred" 
            }
        });

        if (assertion) {
            const savedPass = await getFromPermanentStorage('master_vault');
            if (savedPass) {
                document.getElementById('master-password').value = savedPass;
                document.getElementById('unlock-btn').click();
            } else {
                alert("Données biométriques introuvables.");
            }
        }
    } catch (e) {
        console.error(e);
        alert("Authentification échouée.");
    }
});

// --- 5. DÉCONNEXION ---
document.getElementById('logout-btn').addEventListener('click', () => {
    userKey = null;
    location.reload();
});
