/**
 * Borra una cuenta y todo lo que le pertenece.
 *
 * Uso:
 *   node scripts/borrar-cuenta.mjs alguien@email.com
 *   node scripts/borrar-cuenta.mjs alguien@email.com --dry-run
 *
 * /privacidad promete: "escribinos desde el email de tu cuenta y borramos
 * tu perfil y tus campañas". Este script es cómo se cumple esa promesa.
 *
 * Por qué un script y no un trigger: los objetos de Storage NO se pueden
 * borrar desde un trigger de Postgres. `storage.objects` tiene RLS y es de
 * `supabase_storage_admin`, así que un SECURITY DEFINER de `postgres` no la
 * bypassa y el DELETE matchea 0 filas en silencio (se probó). La API de
 * Storage con service role sí puede.
 *
 * El orden importa: primero los archivos, después el usuario. Si se borra
 * el usuario primero, se pierden los ids que hacen falta para encontrar sus
 * archivos y quedan huérfanos para siempre.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const email = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!email) {
  console.error("Falta el email. Uso: node scripts/borrar-cuenta.mjs alguien@email.com [--dry-run]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i)] = t.slice(i + 1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = ["avatars", "campaign-banners"];

// Supabase pagina listUsers; se recorre hasta encontrarlo.
async function buscarUsuario(mail) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("listUsers: " + error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === mail.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await buscarUsuario(email);
if (!user) {
  console.error(`No existe ninguna cuenta con el email ${email}`);
  process.exit(1);
}

console.log(`Cuenta: ${user.email} (${user.id})`);

const { data: perfil } = await admin
  .from("profiles")
  .select("handle, full_name")
  .eq("id", user.id)
  .maybeSingle();
console.log(`Handle: ${perfil?.handle ?? "(sin handle)"}`);

const { data: campanas } = await admin
  .from("campaigns")
  .select("slug, title")
  .eq("owner_id", user.id);
console.log(`Campañas a borrar: ${campanas?.length ?? 0}`);
for (const c of campanas ?? []) console.log(`  - /${c.slug} "${c.title}"`);

// Los archivos viven bajo una carpeta con el uid de la persona.
const archivos = [];
for (const bucket of BUCKETS) {
  const { data: files } = await admin.storage.from(bucket).list(user.id);
  for (const f of files ?? []) archivos.push({ bucket, path: `${user.id}/${f.name}` });
}
console.log(`Archivos en Storage: ${archivos.length}`);
for (const a of archivos) console.log(`  - ${a.bucket}/${a.path}`);

if (dryRun) {
  console.log("\n--dry-run: no se borró nada.");
  process.exit(0);
}

// 1) Archivos primero: después de borrar el usuario ya no se sabe qué
//    carpeta era suya.
for (const { bucket, path } of archivos) {
  const { error } = await admin.storage.from(bucket).remove([path]);
  console.log(`borrado ${bucket}/${path} -> ${error ? "ERROR: " + error.message : "ok"}`);
}

// 2) El usuario. Cascadea a profiles y de ahí a campañas, solicitudes,
//    conexión de MP y stats. Las contribuciones se anonimizan (SET NULL),
//    no se borran: son respaldo de plata que se movió entre terceros, tal
//    como lo declara /privacidad.
const { error } = await admin.auth.admin.deleteUser(user.id);
if (error) {
  console.error("ERROR borrando el usuario:", error.message);
  process.exit(1);
}
console.log("usuario borrado -> ok");

// 3) Verificar que no quedó nada suelto.
const restantes = [];
for (const bucket of BUCKETS) {
  const { data: files } = await admin.storage.from(bucket).list(user.id);
  if ((files?.length ?? 0) > 0) restantes.push(`${bucket}: ${files.length} archivo(s)`);
}
const { count: perfilesRestantes } = await admin
  .from("profiles")
  .select("*", { count: "exact", head: true })
  .eq("id", user.id);

if (restantes.length > 0 || perfilesRestantes) {
  console.error("\nATENCIÓN, quedó residuo:", restantes.join(", "), `perfiles=${perfilesRestantes}`);
  process.exit(1);
}
console.log("\nVerificado: no quedó ningún archivo ni fila de esta cuenta.");
