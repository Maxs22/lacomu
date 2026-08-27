<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# lacomu (lacomu.ar)

Lee este archivo COMPLETO antes de modificar nada. Estas reglas son innegociables.

## Objetivo

Validar si desconocidos ayudan económicamente a personas u organizaciones con las causas que ellas mismas eligen contar — sin que lacomu juzgue si el motivo "merece" ayuda o no. Puede ser perder el trabajo, comprar una herramienta para poder trabajar, sostener un proyecto propio (ej. cursos gratuitos) o apoyar a una organización (ej. una ONG). La curaduría de lacomu es sobre legitimidad (evitar fraude/spam), no sobre el valor moral del pedido.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase: Postgres, Auth OTP por email, Storage
- Mercado Pago (OAuth Marketplace, ver orden de implementación)
- Vercel

## Reglas de producto

- Mobile-first.
- Donar NO requiere login.
- Crear/administrar campaña SÍ requiere login.
- Login sin contraseña: OTP numérico por email (8 dígitos — el largo lo define Supabase en Authentication → Settings → Email OTP Length; si se cambia allá, actualizar CODE_LENGTH en src/app/ingresar/page.tsx). La pantalla se llama "Ingresar a lacomu" — no separar "Registrarse" de "Iniciar sesión".
- Sin categoría fija: cada campaña define su propio motivo en título/descripción libre (necesidad personal, proyecto propio, apoyo a una organización, lo que sea). No hay taxonomía de categorías en el MVP.
- Las campañas se publican solas, sin revisión manual: cada usuario carga su pedido y queda visible al toque. No hay panel de admin para aprobar/rechazar.
- lacomu NO custodia fondos. Mercado Pago se usa por reconciliación (preference/webhook/external_reference), pagando directo al beneficiario.
- Comisión de la plataforma: 1% vía `marketplace_fee` del modelo Marketplace de MP — MP hace el split solo, la plata nunca pasa por una cuenta nuestra. Se descuenta DESPUÉS de la comisión de Mercado Pago. Debe estar declarada en la UI antes de pagar y en /terminos: el donante tiene derecho a saber que no llega el 100%. La constante vive en src/lib/fees.ts.
- No implementar: empleo, marketplace, chat, seguidores, puntos, wallet, ni ninguna funcionalidad que no valide la hipótesis central.
- Tracking de "cadena de ayuda" (quién ayudó a quién) es best-effort, nunca bloqueante: se completa solo cuando el donante tiene cuenta o cuando el beneficiario vincula Mercado Pago vía OAuth Marketplace. Si no se puede rastrear, no se rastrea — no forzar login ni vinculación para permitir donar o crear campaña.

## Entidades (Supabase/Postgres)

- `profiles` — incluye `role` ('user' | 'admin'), sin uso activo en el MVP (no hay aprobación manual, ver Reglas de producto). Queda reservado para una futura moderación posterior si hiciera falta. `role` NO es editable por el propio usuario ni por RLS ni por privilegios de columna — solo el service role puede tocarlo. `profiles.id` referencia `auth.users.id`. Trigger crea el profile al crearse el `auth.users`.
- `campaign_applications`
- `campaigns`
- `campaign_items`
- `campaign_evidence`
- `campaign_updates`
- `contributions` — `profile_id` nullable (se completa si el donante está logueado); `donor_email` nullable (solo para reconstruir identidad después, nunca se expone públicamente); soporta donante anónimo o con nombre público.

Reglas de RLS mínimas:

- Campañas publicadas: lectura pública.
- Cada usuario lee/edita su propio `profile`.
- El creador gestiona sus propias `campaigns` / `campaign_applications`. Las `campaign_applications` nacen ya `approved` (default de columna) y un trigger las publica como `campaigns` en el mismo insert — no hay paso de aprobación humana.
- `contributions`: cualquiera puede insertar una donación a una campaña publicada, pero SOLO con `status = 'pending'` (forzado en el `with check` de la policy) — confirmar/rechazar el pago (`status = 'confirmed'/'failed'`) lo hace exclusivamente el webhook de Mercado Pago con el service role, nunca un insert/update de cliente. No exponer email ni datos privados en lectura pública; respetar el flag de donante anónimo.

## URLs

Cada persona tiene un handle y su espacio vive en la raíz:

- `lacomu.ar/{handle}` — su perfil público con sus pedidos
- `lacomu.ar/{handle}/{slug}` — un pedido puntual (URL canónica)
- `lacomu.ar/campanas/{uuid}` — legacy, redirige 308 a la canónica. **No
  borrar**: esos links se compartieron antes de que existieran los handles.

El handle se genera del email al registrarse (trigger `handle_new_user`) y
se puede cambiar desde `/perfil`. El slug del pedido se genera del título
una sola vez y **no** se recalcula si el título cambia: romper un link ya
compartido es peor que tener un slug desactualizado.

La campaña se busca por handle + slug juntos, así `/otra-persona/mi-pedido`
no resuelve y el link es verificable.

**Al agregar una ruta estática nueva en la raíz**, sumar su nombre a la
tabla `reserved_handles`. Si no, alguien puede tomarlo como handle y su
perfil queda inalcanzable, porque Next le da precedencia a la ruta
estática.

## UX

Inspiración de simplicidad: Matecito. No diseñar como dashboard SaaS. Contenido y personas primero, mucho espacio, fotos grandes, CTA claro.

## Orden de implementación del MVP

1. ✅ Repo Next.js + TypeScript.
2. ✅ Configurar Supabase (clientes browser/server, variables de entorno).
3. ✅ Esquema SQL del MVP + RLS.
4. ✅ Login OTP por email.
5. ✅ Home + detalle de campaña con datos mock.
6. ✅ Conectar campañas reales desde Supabase.
7. ✅ Formulario "Necesito ayuda" (`campaign_applications`, auto-publica).
8. ✅ Dashboard básico del beneficiario (`/mis-solicitudes`).
9. ❌ Descartado: no hay aprobación manual, ver Reglas de producto. `role`/RLS de admin quedan en el schema sin uso activo (moderación posterior futura, no un gate de publicación).
10. ✅ Mercado Pago (OAuth Marketplace) — falta cargar credenciales reales y probar contra sandbox.

## Deploy

**Producción se actualiza SOLO con aprobación explícita del dueño del
proyecto. Un push no es una aprobación.**

Los pushes no deployan nada: la integración de git con Vercel está
desconectada a propósito, y `vercel.json` además declara
`git.deploymentEnabled.main: false` como segunda barrera.

Para publicar, una vez aprobado:

    vercel deploy --prod

**No re-habilitar el auto-deploy.** Estuvo activo el 26/08 y el resultado
fue que cada push iba a producción sin que nadie lo pidiera.

Contracara a tener en cuenta: sin auto-deploy, `main` y producción pueden
divergir. Ya pasó — durante un día producción sirvió un build viejo con el
login roto (pedía 6 dígitos cuando Supabase manda 8) porque nadie corrió el
deploy. Si aparece una diferencia entre lo que está en `main` y lo que
sirve el dominio, es esto: hay que pedir aprobación y deployar, no
re-conectar git.

### Orden al deployar cambios de base

Migración primero, código después. Si se pushea/deploya código que usa una
tabla cuya migración todavía no se aplicó, producción queda leyendo algo
que no existe. Ya estuvo a punto de pasar con `campaign_stats`.

Las variables `NEXT_PUBLIC_*` se compilan dentro del build: cambiarlas en
Vercel no tiene efecto hasta que haya un deploy nuevo.

### Cuidado con `node -e` y backticks en bash

Un script con backticks dentro de `node -e "..."` en bash hace que bash los
ejecute como comandos. Así se disparó un `vercel deploy` accidental. Para
escribir archivos con backticks, usar el editor de archivos, no bash.

## Workflow de agentes/IA

Una IA escribe el repo, otra revisa — nunca varias tocando el código al mismo tiempo. Claude Code es el implementador principal de este repo. No agregar librerías que no sean estrictamente necesarias para la tarea en curso. No inventar funcionalidades fuera del MVP. Al terminar una tarea: correr lint, typecheck y build; corregir errores; resumir archivos creados/modificados.
