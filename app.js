// --- UTILITAIRE INDEXEDDB ---
// Permet de sauvegarder le mot de passe maître de façon persistante
async function saveToPermanentStorage(key, value) {
    const db = await openDB();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(value, key);
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
    db.transaction("settings", "readwrite").objectStore("settings").clear();
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("VaultaDB", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("settings");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- LOGIQUE DE DÉVERROUILLAGE (MISE À JOUR) ---
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Entrez votre mot de passe maître");

    const salt = new TextEncoder().encode("un-sel-fixe-pour-le-moment"); 
    
    try {
        userKey = await deriveKey(masterPass, salt);
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        // On ne stocke plus ici, mais on prépare la possibilité de le faire via le bouton "Activer"
        loadPasswords();
    } catch (e) {
        alert("Erreur de déverrouillage");
    }
});

// --- LOGIQUE BIOMÉTRIQUE (INDEXEDDB) ---

document.getElementById('enable-bio-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    if(!masterPass) return alert("Veuillez d'abord vous connecter manuellement.");

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
            // SAUVEGARDE PERMANENTE : On stocke le mdp maître dans IndexedDB
            await saveToPermanentStorage('master_vault', masterPass);
            localStorage.setItem('bio_enabled', 'true');
            alert("Empreinte activée ! Vous pourrez maintenant déverrouiller même après avoir redémarré.");
        }
    } catch (e) {
        alert("Erreur biométrie : " + e.message);
    }
});

document.getElementById('biometric-btn').addEventListener('click', async () => {
    // RÉCUPÉRATION : On cherche le mdp dans la base permanente
    const savedPass = await getFromPermanentStorage('master_vault');
    
    if (!savedPass) {
        return alert("Aucune empreinte enregistrée ou session supprimée. Connectez-vous manuellement.");
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
        alert("Échec de l'empreinte.");
    }
});

// --- DÉCONNEXION (MISE À JOUR) ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    userKey = null;
    // On vide tout pour la sécurité si on quitte volontairement
    await clearPermanentStorage();
    localStorage.removeItem('bio_enabled');
    location.reload(); 
});
