import { deriveKey, encryptData, decryptData } from './crypto.js';

let userKey = null; // La clé dérivée reste en mémoire vive (RAM) uniquement

// --- 1. UTILITAIRES INDEXEDDB (Pour stocker le Master Pass chiffré par l'OS) ---
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

async function clearPermanentStorage() {
    const db = await openDB();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").clear();
    return new Promise((resolve) => tx.oncomplete = resolve);
}

// --- 2. LOGIQUE DE DÉVERROUILLAGE ---
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Entrez votre mot de passe maître");

    // NOTE : Pour une vraie prod, le sel doit être unique par utilisateur et stocké.
    // Ici on garde un sel fixe pour simplifier la démo.
    const salt = new TextEncoder().encode("salt-fixe-v1-vaulta-app"); 
    
    try {
        // Dérivation de la clé (PBKDF2)
        userKey = await deriveKey(masterPass, salt);
        
        // Transition UI
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        // Chargement des données
        loadPasswords();
        
        // Vérifier si la biométrie est déjà active pour cacher/afficher le bouton "Activer"
        const bioEnabled = localStorage.getItem('bio_enabled');
        if (bioEnabled) {
             document.getElementById('enable-bio-btn').style.display = 'none';
        }

    } catch (e) {
        console.error(e);
        alert("Erreur lors de la génération des clés.");
    }
});

// --- 3. GESTION DES MOTS DE PASSE (AJOUT & AFFICHAGE) ---

// Sauvegarder un nouveau mot de passe
document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userKey) return alert("Session expirée. Veuillez recharger.");

    const site = document.getElementById('site-input').value;
    const username = document.getElementById('id-input').value;
    const password = document.getElementById('pass-input').value;

    const dataObj = { site, username, password, date: new Date().toISOString() };
    const jsonStr = JSON.stringify(dataObj);

    try {
        // Chiffrement AES-GCM
        const encrypted = await encryptData(jsonStr, userKey);
        
        // Sauvegarde dans localStorage
        const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');
        vault.push(encrypted);
        localStorage.setItem('vault_data', JSON.stringify(vault));

        e.target.reset();
        loadPasswords(); // Rafraîchir la liste
    } catch (err) {
        alert("Erreur de chiffrement : " + err.message);
    }
});

// Charger et déchiffrer la liste
async function loadPasswords() {
    const listContainer = document.getElementById('password-list');
    listContainer.innerHTML = '';

    const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');

    if (vault.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; opacity:0.6;">Aucun mot de passe sécurisé.</p>';
        return;
    }

    // On boucle sur chaque élément chiffré
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
            
            // Bouton Copier
            card.querySelector('.copy-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(entry.password);
                alert('Mot de passe copié !');
            });

            // Bouton Supprimer
            card.querySelector('.del-btn').addEventListener('click', () => {
                if(confirm('Supprimer cet identifiant ?')) {
                    deleteEntry(i);
                }
            });

            listContainer.appendChild(card);
        } catch (err) {
            console.error("Échec déchiffrement index " + i, err);
            const errDiv = document.createElement('div');
            errDiv.className = 'card';
            errDiv.innerText = "Donnée corrompue ou mauvaise clé.";
            listContainer.appendChild(errDiv);
        }
    }
}

function deleteEntry(index) {
    const vault = JSON.parse(localStorage.getItem('vault_data') || '[]');
    vault.splice(index, 1);
    localStorage.setItem('vault_data', JSON.stringify(vault));
    loadPasswords();
}

// --- 4. BIOMÉTRIE (WebAuthn) ---

// Initialisation au chargement : vérifie si biométrie active
window.addEventListener('load', async () => {
    const bioEnabled = localStorage.getItem('bio_enabled');
    if (bioEnabled === 'true') {
        document.getElementById('biometric-login-btn').style.display = 'block';
    }
});

// A. Activer la biométrie (depuis le Dashboard)
document.getElementById('enable-bio-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    
    // Sécurité : On a besoin du mot de passe maître pour l'enregistrer
    if(!masterPass) {
        return alert("Erreur : Mot de passe maître introuvable en mémoire. Reconnectez-vous manuellement.");
    }

    try {
        // Création des options WebAuthn
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const publicKey = {
            challenge: challenge,
            rp: { name: "Vaulta App" },
            user: {
                id: window.crypto.getRandomValues(new Uint8Array(16)),
                name: "user@vaulta",
                displayName: "Utilisateur Vaulta"
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
            authenticatorSelection: { 
                authenticatorAttachment: "platform", // FaceID / TouchID
                userVerification: "required"
            },
            timeout: 60000
        };

        const credential = await navigator.credentials.create({ publicKey });

        if (credential) {
            // Si l'OS valide l'empreinte, on stocke le mot de passe maître dans IndexedDB
            await saveToPermanentStorage('master_vault', masterPass);
            localStorage.setItem('bio_enabled', 'true');
            
            alert("Biométrie activée !");
            document.getElementById('enable-bio-btn').style.display = 'none';
        }
    } catch (e) {
        console.error(e);
        alert("Impossible d'activer la biométrie : " + e.message);
    }
});

// B. Se connecter avec biométrie (depuis l'écran de Login)
document.getElementById('biometric-login-btn').addEventListener('click', async () => {
    try {
        // On demande à l'OS de vérifier l'utilisateur
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
            publicKey: { 
                challenge: challenge,
                userVerification: "required"
            }
        });

        if (assertion) {
            // Si succès, on récupère le mot de passe maître stocké
            const savedPass = await getFromPermanentStorage('master_vault');
            if (savedPass) {
                document.getElementById('master-password').value = savedPass;
                document.getElementById('unlock-btn').click(); // On simule le clic
            } else {
                alert("Erreur : Mot de passe non trouvé. Reconnectez-vous avec le mot de passe.");
            }
        }
    } catch (e) {
        console.error(e);
        alert("Authentification biométrique annulée ou échouée.");
    }
});

// --- 5. DÉCONNEXION ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    // Nettoyage complet de la mémoire vive
    userKey = null;
    document.getElementById('master-password').value = "";
    
    // (Optionnel) Si vous voulez désactiver la biométrie à la déconnexion, décommentez :
    // await clearPermanentStorage(); 
    // localStorage.removeItem('bio_enabled');

    location.reload(); // Recharge la page pour tout remettre à zéro
});
