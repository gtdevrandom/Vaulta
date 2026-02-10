import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deriveKey, encryptData, decryptData } from "./crypto.js";

const firebaseConfig = {
    apiKey: "TON_API_KEY",
    projectId: "TON_PROJECT_ID",
    // ... remplis le reste
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let userKey = null; // Stockée uniquement en mémoire vive

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
        // On déchiffre ici
        const clearPass = await decryptData(data.password, data.iv, userKey);
        list.innerHTML += `<div class="card">
            <strong>${data.site}</strong>: ${clearPass}
        </div>`;
    });
}
