/**
 * Genera el par de claves VAPID que necesitan las notificaciones push.
 * Se ejecuta UNA vez; el resultado va a .env.local y al entorno de produccion.
 *
 *   npm run push:claves
 *
 * Cambiar las claves invalida todas las suscripciones existentes: cada
 * dispositivo tendria que volver a activar los avisos.
 */
import webpush from 'web-push';

const claves = webpush.generateVAPIDKeys();

console.log('Anade esto a .env.local y al entorno de produccion:\n');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${claves.publicKey}`);
console.log(`VAPID_PUBLIC_KEY=${claves.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${claves.privateKey}`);
console.log('\nLa clave privada NO se comparte ni se commitea.');
