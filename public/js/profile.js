import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./Firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

// DOM Elements
const elements = {
    profileInitials: document.getElementById('profileInitials'),
    displayEmail: document.getElementById('displayEmail'),
    displayJoinDate: document.getElementById('displayJoinDate'),
    roleBadge: document.getElementById('roleBadge'),
    inputName: document.getElementById('inputName'),
    inputEmail: document.getElementById('inputEmail'),
    inputCompany: document.getElementById('inputCompany'),
    profileForm: document.getElementById('profileForm'),
    saveBtn: document.getElementById('saveProfileBtn'),
    saveText: document.getElementById('saveText'),
    saveIcon: document.getElementById('saveIcon'),
    saveSpinner: document.getElementById('saveSpinner'),
    toastContainer: document.getElementById('toastContainer')
};

// State
let currentUserDocRef = null;

// Initialize Profile Page
document.addEventListener('DOMContentLoaded', () => {
    // Listen for auth state specifically to grab the UID for Firestore
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserDocRef = doc(firestore, 'users', user.uid);
            await loadUserProfile(user);
        } else {
            console.error("User not authenticated on profile page");
            window.location.replace('/login.html');
        }
    });

    // Form Submission
    elements.profileForm.addEventListener('submit', handleProfileUpdate);
});

/**
 * Load user data from Firestore and populate the UI
 */
async function loadUserProfile(user) {
    try {
        const userDoc = await getDoc(currentUserDocRef);

        if (userDoc.exists()) {
            const data = userDoc.data();

            // Set Static/Display Data
            const seedName = encodeURIComponent(data.fullName || user.email || 'user');
            elements.profileInitials.innerHTML = `<img src="https://api.dicebear.com/7.x/notionists/svg?seed=${seedName}&backgroundColor=b2ebf2" alt="Profile" class="w-full h-full object-cover">`;

            elements.displayEmail.textContent = data.fullName || user.email.split('@')[0];

            // Format Join Date
            let joinText = "Member since recent updates";
            if (data.createdAt) {
                // Handle Firestore Timestamp
                const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                if (!isNaN(date)) {
                    joinText = `Member since ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
                }
            }
            elements.displayJoinDate.textContent = joinText;

            // Role Badge
            elements.roleBadge.classList.remove('hidden');
            if (data.isAdmin) {
                elements.roleBadge.textContent = 'ADMIN 👑';
            } else if (data.bulkCredits && data.bulkCredits > 1) {
                elements.roleBadge.textContent = 'PREMIUM USER';
            } else {
                elements.roleBadge.textContent = 'STANDARD USER';
            }

            // Populate Form Inputs
            elements.inputName.value = data.fullName || '';
            elements.inputEmail.value = user.email; // Auth email
            elements.inputCompany.value = data.companyName || '';
        } else {
            // Fallback if doc doesn't exist yet but user is logged in
            elements.displayEmail.textContent = user.email;
            const fallbackSeed = encodeURIComponent(user.email || 'user');
            elements.profileInitials.innerHTML = `<img src="https://api.dicebear.com/7.x/notionists/svg?seed=${fallbackSeed}&backgroundColor=b2ebf2" alt="Profile" class="w-full h-full object-cover">`;
            console.warn("User document not found in Firestore.");
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        showToast("Failed to load profile details.", "error");
    }
}

/**
 * Handle form submission to update Firestore data
 */
async function handleProfileUpdate(e) {
    e.preventDefault();
    if (!currentUserDocRef) return;

    // Get input values
    const newName = elements.inputName.value.trim();
    const newCompany = elements.inputCompany.value.trim();

    // UI Loading state
    setLoadingState(true);

    try {
        await updateDoc(currentUserDocRef, {
            fullName: newName,
            companyName: newCompany
        });

        // Update display UI to reflect immediately
        elements.displayEmail.textContent = newName || elements.inputEmail.value.split('@')[0];
        const newSeed = encodeURIComponent(newName || elements.inputEmail.value || 'user');
        elements.profileInitials.innerHTML = `<img src="https://api.dicebear.com/7.x/notionists/svg?seed=${newSeed}&backgroundColor=b2ebf2" alt="Profile" class="w-full h-full object-cover">`;

        showToast("Profile completely updated!", "success");
    } catch (error) {
        console.error("Error updating profile:", error);
        showToast("Failed to update profile. Please try again.", "error");
    } finally {
        setLoadingState(false);
    }
}

/**
 * Toggle button loading state
 */
function setLoadingState(isLoading) {
    if (isLoading) {
        elements.saveText.textContent = 'Saving...';
        elements.saveIcon.classList.add('hidden');
        elements.saveSpinner.classList.remove('hidden');
        elements.saveBtn.disabled = true;
        elements.saveBtn.classList.add('opacity-80', 'cursor-not-allowed');
    } else {
        elements.saveText.textContent = 'Save Profile';
        elements.saveIcon.classList.remove('hidden');
        elements.saveSpinner.classList.add('hidden');
        elements.saveBtn.disabled = false;
        elements.saveBtn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
}

/**
 * Custom Toast Notification (Reusing styling logic from other app parts)
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const isError = type === 'error';

    toast.className = `p-4 rounded-xl shadow-lg border-2 flex items-center gap-3 transform translate-x-full transition-transform duration-300 animate-slide-in ${isError
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-soft-turquoise border-vibrant-turquoise text-slate-700'
        }`;

    toast.innerHTML = `
        <span class="material-symbols-outlined ${isError ? 'text-red-500' : 'text-vibrant-turquoise'} p-2 rounded-lg bg-white shadow-sm">
            ${isError ? 'error' : 'task_alt'}
        </span>
        <p class="font-bold pr-4">${message}</p>
    `;

    // Add unique animation class
    if (!document.getElementById('toastKeyframes')) {
        const style = document.createElement('style');
        style.id = 'toastKeyframes';
        style.innerHTML = `
            @keyframes toast-slide-in {
                0% { transform: translateX(100%) scale(0.9); opacity: 0; }
                100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            .animate-slide-in { animation: toast-slide-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        `;
        document.head.appendChild(style);
    }

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
