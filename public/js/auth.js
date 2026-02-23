import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./Firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

/**
 * Check authentication state
 * @param {boolean} requireAuth - If true, redirect to login if not authenticated
 * @param {boolean} redirectIfAuth - If true, redirect to app.html if authenticated (for login page)
 */
export function checkAuth(requireAuth = false, redirectIfAuth = false) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User is logged in:', user.email);

            // Check approval status from Firestore
            try {
                const userDoc = await getDoc(doc(firestore, 'users', user.uid));

                if (userDoc.exists()) {
                    const userData = userDoc.data();

                    // Update last login
                    updateDoc(doc(firestore, 'users', user.uid), {
                        lastLogin: serverTimestamp()
                    }).catch(err => console.warn('Failed to update lastLogin:', err));

                    if (!userData.approved) {
                        // User not approved — show waiting screen
                        if (redirectIfAuth) {
                            // On login page, show waiting screen instead of redirecting
                            showWaitingScreen(user.email);
                            return;
                        }
                        // On protected pages, redirect to login with waiting state
                        if (requireAuth) {
                            window.location.replace('/login.html?waiting=true');
                            return;
                        }
                    } else {
                        // User is approved
                        if (redirectIfAuth) {
                            window.location.replace('/app.html');
                            return;
                        }
                    }

                    // Check if admin and update UI
                    const isAdminUser = await checkIsAdmin(user.uid);
                    updateAuthUI(user, isAdminUser, userData.allowBulkFill || false);
                } else {
                    // No user doc — create one (edge case: registered before this system)
                    await createUserDoc(user);
                    if (redirectIfAuth) {
                        showWaitingScreen(user.email);
                        return;
                    }
                    if (requireAuth) {
                        window.location.replace('/login.html?waiting=true');
                        return;
                    }
                }
            } catch (error) {
                console.error('Error checking user approval:', error);
                // On error, allow access but log it
                if (redirectIfAuth) {
                    window.location.replace('/app.html');
                }
                updateAuthUI(user, false);
            }
        } else {
            console.log('User is logged out');
            if (requireAuth) {
                window.location.replace('/login.html');
            }
        }

        // Dispatch event that auth is ready
        window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user } }));
    });
}

/**
 * Create Firestore user document
 */
async function createUserDoc(user) {
    try {
        await setDoc(doc(firestore, 'users', user.uid), {
            email: user.email,
            displayName: user.displayName || '',
            role: 'student',
            approved: false,
            active: true,
            allowedTemplates: [],
            createdAt: serverTimestamp()
        });
        console.log('User document created in Firestore');
    } catch (error) {
        console.error('Error creating user document:', error);
    }
}

/**
 * Check if user is admin
 */
async function checkIsAdmin(uid) {
    try {
        const adminDoc = await getDoc(doc(firestore, 'admins', uid));
        return adminDoc.exists();
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

/**
 * Public isAdmin check (for other modules)
 */
export async function isAdmin() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe();
            if (user) {
                resolve(await checkIsAdmin(user.uid));
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Public bulk fill access check (for other modules)
 */
export async function hasBulkFillAccess() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe();
            if (user) {
                const isAdminUser = await checkIsAdmin(user.uid);
                if (isAdminUser) return resolve(true);

                try {
                    const userDoc = await getDoc(doc(firestore, 'users', user.uid));
                    if (userDoc.exists() && userDoc.data().allowBulkFill) {
                        return resolve(true);
                    }
                } catch (error) {
                    console.error('Error checking bulk access:', error);
                }
            }
            resolve(false);
        });
    });
}

/**
 * Get Firebase ID token for API calls
 */
export async function getIdToken() {
    const user = auth.currentUser;
    if (user) {
        return await user.getIdToken();
    }
    return null;
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

        // Create Firestore user document
        await createUserDoc(userCredential.user);

        return { success: true, user: userCredential.user, needsApproval: true };
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
 * Show "Waiting for Admin Approval" screen
 */
function showWaitingScreen(email) {
    const waitingEl = document.getElementById('waitingScreen');
    const loginForm = document.getElementById('loginForm');
    const formContainer = document.querySelector('.form-container');

    if (waitingEl) {
        waitingEl.style.display = 'block';
        if (loginForm) loginForm.style.display = 'none';

        const emailEl = waitingEl.querySelector('.waiting-email');
        if (emailEl) emailEl.textContent = email;
    } else if (formContainer) {
        // Inject waiting screen if element doesn't exist
        formContainer.innerHTML = `
            <div class="waiting-screen">
                <div class="waiting-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;color:var(--primary-light)">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
                <h2 style="color:white;margin:1rem 0 0.5rem">Waiting for Admin Approval</h2>
                <p style="color:var(--text-secondary);margin-bottom:1.5rem">
                    Your account <strong style="color:var(--primary-light)">${email}</strong> is pending admin approval.
                    You'll be able to access the dashboard once approved.
                </p>
                <button onclick="document.querySelector('[data-logout]').click()" class="btn-login" style="background:var(--bg-elevated);box-shadow:none">
                    Sign Out
                </button>
            </div>
        `;
    }
}

/**
 * Update UI elements based on auth state
 */
function updateAuthUI(user, isAdminUser = false, allowBulkFill = false) {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.textContent = 'Logout';
        loginBtn.href = '#';
        loginBtn.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }

    // Add Admin Panel link and show restricted features if user is admin
    if (isAdminUser) {
        // Show admin link in navbar
        const navLinks = document.querySelector('.nav-links');
        if (navLinks && !document.getElementById('adminLink')) {
            const adminLink = document.createElement('a');
            adminLink.href = '/admin';
            adminLink.className = 'nav-link';
            adminLink.id = 'adminLink';
            adminLink.textContent = '⚙️ Admin';
            adminLink.style.marginRight = '8px';
            adminLink.style.background = 'rgba(99, 102, 241, 0.2)';
            adminLink.style.borderColor = 'var(--primary)';
            navLinks.insertBefore(adminLink, navLinks.firstChild);
        }
    }

    // Show bulk fill container if admin OR allowBulkFill is true
    if (isAdminUser || allowBulkFill) {
        const bulkFillContainer = document.getElementById('bulkFillContainer');
        if (bulkFillContainer) {
            bulkFillContainer.style.display = 'block';
        }
    }
}

/**
 * Get current user ID (Promise)
 * Exposed globally for non-module scripts
 */
window.getCurrentUserId = () => {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user ? user.uid : null);
        });
    });
};

/**
 * Get Firebase ID token (global)
 */
window.getFirebaseToken = async () => {
    const user = auth.currentUser;
    if (user) {
        return await user.getIdToken();
    }
    return null;
};
