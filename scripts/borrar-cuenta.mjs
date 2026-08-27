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
 * PRINCIPIO: ante cualquier duda, NO borrar el usuario. Borrarlo hace
 * perder el id que hace falta para encontrar sus archivos; si quedan
 * huérfanos, sus URLs públicas siguen vivas y ya no hay forma de saber de
 * quién eran. Es preferible abortar y que un humano mire.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const email = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!email) {
  console.error(
    "Falta el email. Uso: node scripts/borrar-cuenta.mjs alguien@email.com [--dry-run]",
  );
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
const PAGE = 100;

function abortar(motivo) {
  console.error(`\nABORTADO: ${motivo}`);
  console.error("No se borró el usuario. Revisar a mano antes de reintentar.");
  process.exit(1);
}

/**
 * Lista TODOS los objetos bajo una carpeta.
 *
 * `list()` pagina (100 por defecto): sin recorrer las páginas, una cuenta
 * con más de 100 archivos conservaría los del 101 en adelante y el script
 * habría informado que quedó limpia.
 *
 * Un error de listado NO se puede tratar como "no hay archivos": es
 * justamente el caso en que no sabemos. Se aborta.
 */
async function listarTodo(bucket, carpeta) {
  const encontrados = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(carpeta, { limit: PAGE, offset });

    if (error) {
      abortar(`no se pudo listar ${bucket}/${carpeta} (offset ${offset}): ${error.message}`);
    }

    const lote = data ?? [];
    // Los "archivos" sin id son subcarpetas; se recorren aparte.
    for (const item of lote) {
      if (item.id === null) {
        const anidados = await listarTodo(bucket, `${carpeta}/${item.name}`);
        encontrados.push(...anidados);
      } else {
        encontrados.push(`${carpeta}/${item.name}`);
      }
    }

    if (lote.length < PAGE) return encontrados;
  }
}

async function buscarUsuario(mail) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) abortar(`listUsers: ${error.message}`);
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

console.log(`Cuenta:  ${user.email} (${user.id})`);

const { data: perfil, error: errPerfil } = await admin
  .from("profiles")
  .select("handle, full_name")
  .eq("id", user.id)
  .maybeSingle();
if (errPerfil) abortar(`no se pudo leer el perfil: ${errPerfil.message}`);
console.log(`Handle:  ${perfil?.handle ?? "(sin handle)"}`);

const { data: campanas, error: errCamp } = await admin
  .from("campaigns")
  .select("slug, title")
  .eq("owner_id", user.id);
if (errCamp) abortar(`no se pudieron leer las campañas: ${errCamp.message}`);
console.log(`Campañas: ${campanas?.length ?? 0}`);
for (const c of campanas ?? []) console.log(`  - /${c.slug} "${c.title}"`);

const archivos = [];
for (const bucket of BUCKETS) {
  for (const path of await listarTodo(bucket, user.id)) {
    archivos.push({ bucket, path });
  }
}
console.log(`Archivos: ${archivos.length}`);
for (const a of archivos) console.log(`  - ${a.bucket}/${a.path}`);

if (dryRun) {
  console.log("\n--dry-run: no se borró nada.");
  process.exit(0);
}

// 1) Archivos primero: después de borrar el usuario ya no se sabe qué
//    carpeta era suya. Un error acá aborta, no se sigue.
for (const bucket of BUCKETS) {
  const paths = archivos.filter((a) => a.bucket === bucket).map((a) => a.path);
  if (paths.length === 0) continue;

  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    abortar(`no se pudieron borrar archivos de ${bucket}: ${error.message}`);
  }
  console.log(`borrados ${paths.length} archivo(s) de ${bucket}`);
}

// 2) Verificar que Storage quedó limpio ANTES de borrar el usuario. Si se
//    verificara después y algo hubiera quedado, ya no habría forma de
//    identificar de quién era.
for (const bucket of BUCKETS) {
  const restantes = await listarTodo(bucket, user.id);
  if (restantes.length > 0) {
    abortar(`quedaron ${restantes.length} archivo(s) en ${bucket}: ${restantes.join(", ")}`);
  }
}
console.log("Storage verificado: sin archivos de esta cuenta.");

// 3) El usuario. Cascadea a profiles y de ahí a campañas, solicitudes,
//    conexión de MP y stats. Las contribuciones se anonimizan (SET NULL),
//    no se borran: son respaldo de plata que se movió entre terceros, tal
//    como lo declara /privacidad.
const { error: errBorrado } = await admin.auth.admin.deleteUser(user.id);
if (errBorrado) abortar(`no se pudo borrar el usuario: ${errBorrado.message}`);
console.log("usuario borrado");

// 4) Verificación final de la base.
const { count, error: errCount } = await admin
  .from("profiles")
  .select("*", { count: "exact", head: true })
  .eq("id", user.id);
if (errCount) abortar(`no se pudo verificar el borrado del perfil: ${errCount.message}`);
if (count) abortar(`el perfil sigue existiendo (${count} fila/s)`);

console.log("\nListo. Ni archivos ni filas de esta cuenta.");
