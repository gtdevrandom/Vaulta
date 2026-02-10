import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let userKey = null; // Stockée uniquement en mémoire vive
// Ajout gestion formulaire
document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const site = document.getElementById('site-input').value;
    const identifiant = document.getElementById('id-input').value;
    const motdepasse = document.getElementById('pass-input').value;
    if (!userKey) {
        alert('Veuillez déverrouiller avec le mot de passe maître');
        return;
    }
    try {
        // Chiffrement
        const encrypted = await encryptData(motdepasse, userKey);
        await addDoc(collection(db, "passwords"), {
            site,
            identifiant,
            password: encrypted.cipher,
            iv: encrypted.iv
        });
        document.getElementById('add-form').reset();
        loadPasswords();
    } catch (err) {
        alert('Erreur lors de l\'ajout');
    }
});

document.getElementById('unlock-btn').addEventListener('click', async () => {
    const masterPass = document.getElementById('master-password').value;
    const salt = new TextEncoder().encode("un-sel-fixe-pour-le-moment"); // Idéalement unique par user
    
    try {
        userKey = await deriveKey(masterPass, salt);
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadPasswords();
    } catch (e) {
        alert("Erreur de déverrouillage");
    }
});

async function loadPasswords() {
    const querySnapshot = await getDocs(collection(db, "passwords"));
    const list = document.getElementById('password-list');
    list.innerHTML = "";

    querySnapshot.forEach(async (doc) => {
        const data = doc.data();
        const clearPass = await decryptData(data.password, data.iv, userKey);
        list.innerHTML += `<div class="card">
            <div>
                <strong>${data.site}</strong><br>
                <span>${data.identifiant}</span><br>
                <span>${clearPass}</span>
            </div>
            <button class="delete-btn" onclick="deletePassword('${doc.id}')">Supprimer</button>
        </div>`;
    });
}

// Suppression
window.deletePassword = async function(id) {
    try {
        await deleteDoc(doc(db, "passwords", id));
        loadPasswords();
    } catch (err) {
        alert('Erreur lors de la suppression');
    }
}
}
