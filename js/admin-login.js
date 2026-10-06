import { acceptInvite, getUser, handleAuthCallback, login, recoverPassword } from './vendor/identity.js';

const form = document.getElementById('admin-login-form');
const status = document.getElementById('login-status');
const button = document.getElementById('login-submit');
const email = document.getElementById('admin-email');
const password = document.getElementById('admin-password');
const parameters = new URLSearchParams(location.hash.slice(1));
let inviteToken = parameters.get('invite_token');
let recoveryToken = parameters.get('recovery_token');
let callbackToken = inviteToken || recoveryToken;

if (callbackToken) {
  history.replaceState(null, '', location.pathname);
  document.getElementById('login-title').textContent = inviteToken ? 'Welcome to the circle.' : 'A fresh start.';
  document.getElementById('login-description').textContent = 'Choose a password with at least 12 characters.';
  document.getElementById('login-email-field').hidden = true;
  email.required = false;
  password.autocomplete = 'new-password';
  password.minLength = 12;
  document.getElementById('password-label').textContent = 'New password';
  button.textContent = inviteToken ? 'Accept invitation' : 'Set password';
} else {
  try {
    await handleAuthCallback();
    const user = await getUser();
    if (user?.roles?.includes('admin')) location.replace('/admin');
  } catch {
    status.textContent = 'The sign-in link could not be verified. Use your invited account to sign in.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true;
  status.textContent = 'Checking your account…';
  try {
    const user = inviteToken ? await acceptInvite(inviteToken, password.value)
      : recoveryToken ? await recoverPassword(recoveryToken, password.value)
      : await login(email.value, password.value);
    if (!user.roles?.includes('admin')) {
      status.textContent = 'Your account is verified, but administrator access has not been assigned. The site owner must add the admin role in Netlify Identity. Then sign in again.';
      inviteToken = null;
      recoveryToken = null;
      callbackToken = null;
      document.getElementById('login-email-field').hidden = false;
      email.required = true;
      email.value = user.email || '';
      password.value = '';
      password.autocomplete = 'current-password';
      password.removeAttribute('minlength');
      document.getElementById('password-label').textContent = 'Password';
      button.textContent = 'Sign in';
      return;
    }
    location.assign('/admin');
  } catch {
    status.textContent = callbackToken ? 'That invitation or recovery link could not be verified. Request a new link from the site owner.' : 'Couldn’t sign in. Check your details and try again.';
  } finally {
    button.disabled = false;
  }
});
