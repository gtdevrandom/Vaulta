export async function deriveKey(masterPassword, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw", encoder.encode(masterPassword), 
        "PBKDF2", false, ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 600000, hash: "SHA-256" },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false, ["encrypt", "decrypt"]
    );
}

export async function encryptData(text, key) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Vecteur d'initialisation
    const encodedData = encoder.encode(text);
    
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
    );

    return {
        cipher: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

export async function decryptData(cipher, iv, key) {
    const decoder = new TextDecoder();
    const encryptedData = new Uint8Array(atob(cipher).split("").map(c => c.charCodeAt(0)));
    const ivData = new Uint8Array(atob(iv).split("").map(c => c.charCodeAt(0)));

    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivData },
            key,
            encryptedData
        );
        return decoder.decode(decrypted);
    } catch (e) {
        throw new Error("Mot de passe maître incorrect ou données corrompues");
    }
}
