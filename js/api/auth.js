/**
 * Sesión de la cuenta del hogar (correo y contraseña compartidos).
 */
import { getClient, describeError } from './client.js';

export async function getSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw new Error(describeError(error));
  return data.session || null;
}

export async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(describeError(error));
  return data.session;
}

/**
 * Crea la cuenta del hogar. Si el proyecto exige confirmar el correo,
 * Supabase no devuelve sesión: hay que abrir el enlace del correo.
 */
export async function signUp(email, password) {
  const { data, error } = await getClient().auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { emailRedirectTo: redirectUrl() },
  });
  if (error) throw new Error(describeError(error));
  return { session: data.session, needsConfirmation: !data.session };
}

export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw new Error(describeError(error));
}

export async function sendPasswordReset(email) {
  const { error } = await getClient().auth.resetPasswordForEmail(
    String(email).trim().toLowerCase(),
    { redirectTo: redirectUrl() },
  );
  if (error) throw new Error(describeError(error));
}

export async function updatePassword(password) {
  const { error } = await getClient().auth.updateUser({ password });
  if (error) throw new Error(describeError(error));
}

/** Avisa de los cambios de sesión (entrar, salir, recuperar contraseña). */
export function onAuthChange(handler) {
  const { data } = getClient().auth.onAuthStateChange((event, session) => handler(event, session));
  return () => data?.subscription?.unsubscribe?.();
}

function redirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}
