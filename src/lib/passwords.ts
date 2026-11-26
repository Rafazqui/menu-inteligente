// Reglas de contraseñas del panel (sin dependencias de servidor).

// Contraseñas que ya fueron públicas (README antiguo) o demasiado obvias.
const BANNED = new Set(["hrcoffee2026", "mesero2026", "12345678", "123456789", "password", "contraseña", "qwerty123"]);

export function isBannedPassword(password: string): boolean {
  return BANNED.has(password.toLowerCase());
}

/** Devuelve el motivo si la contraseña es débil, o null si es aceptable. */
export function weakPassword(password: string, username: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (isBannedPassword(password)) return "Esa contraseña es pública o muy común. Elige otra.";
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "La contraseña no puede contener el nombre de usuario.";
  }
  return null;
}
