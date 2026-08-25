# lacomu

Plataforma donde cualquiera puede pedir una mano para la causa que elija —
perder el trabajo, comprar una herramienta, sostener un proyecto propio,
apoyar a una organización. lacomu no juzga el motivo: cada donante elige a
quién ayudar.

Las reglas de producto, entidades y decisiones de arquitectura están en
[`AGENTS.md`](./AGENTS.md). **Leelo antes de tocar código.**

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres + RLS, Auth OTP por email, Storage
- Mercado Pago (OAuth Marketplace — la plata va directo al beneficiario)
- Vercel

## Setup

```bash
npm install
cp .env.local.example .env.local   # completar con los valores reales
npm run dev
```

Variables necesarias (ver `.env.local.example` para el detalle de dónde
sale cada una):

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente browser/server (sujeto a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | solo server-side, bypassa RLS |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | app de Mercado Pago (Marketplace) |
| `MP_WEBHOOK_SECRET` | validar la firma del webhook de MP |
| `NEXT_PUBLIC_APP_URL` | dominio canónico para las URLs de MP |

## Base de datos

Las migraciones viven en `supabase/migrations/`. Para aplicarlas:

```bash
supabase db push --db-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
```

RLS está activa en todas las tablas desde la primera migración. Dos cosas
que conviene tener presentes al tocar el schema:

- `profiles.role` **no** es editable por el usuario (revoke de columna, no
  solo RLS — una policy de UPDATE a nivel fila no alcanza).
- `contributions` solo se puede insertar con `status = 'pending'`;
  confirmar un pago es exclusivo del webhook con service role.

## Antes de dar algo por terminado

```bash
npm run lint
npm run build
```

## Pendiente

- Probar el flujo completo de Mercado Pago contra una cuenta real
  (conectar cuenta → donar → webhook confirma). La integración sigue el
  patrón documentado de Marketplace pero todavía no se ejerció end-to-end.
- Dominio propio (`lacomu.ar`) + SMTP propio para los emails de OTP (hoy
  salen desde el dominio genérico de Supabase, con rate limits bajos).
