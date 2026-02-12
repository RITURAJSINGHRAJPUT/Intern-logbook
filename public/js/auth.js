import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./Firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Check authentication state
 * @param {boolean} requireAuth - If true, redirect to login if not authenticated
 * @param {boolean} redirectIfAuth - If true, redirect to app.html if authenticated (for login page)
 */
export function checkAuth(requireAuth = false, redirectIfAuth = false) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('User is logged in:', user.email);
            if (redirectIfAuth) {
                window.location.replace('/app.html');
            }
            // Update UI for logged in user
            updateAuthUI(user);
        } else {
            console.log('User is logged out');
            if (requireAuth) {
                window.location.replace('/login.html');
            }
        }
    });
}

/**
 * Login function
 */
export async function login(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Register function
 */
export async function register(email, password, fullName) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Update profile with name
        if (fullName) {
            await updateProfile(userCredential.user, {
                displayName: fullName
            });
        }

        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Logout function
 */
export async function logout() {
    try {
        await signOut(auth);
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

/**
 * Update UI elements based on auth state
 */
function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.textContent = 'Logout';
        loginBtn.href = '#';
        loginBtn.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

/**
 * Get current user ID (Promise)
 * exposed globally for non-module scripts
 */
window.getCurrentUserId = () => {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user ? user.uid : null);
        });
    });
};
