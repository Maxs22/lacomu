# Emails de autenticación

Supabase no permite versionar los templates de email desde el repo: se
cargan a mano en el dashboard. Se guardan igual acá porque son parte del
flujo de auth — si viven solo en el dashboard, nadie los ve en un diff.

## magic-link.html

**Dónde va — en LOS DOS, no en uno:** Supabase → Authentication → Email
Templates →

1. **Confirm signup**
2. **Magic Link**

**Por qué en los dos.** Verificado en vivo, no asumido: `signInWithOtp`
sobre un email que Supabase ve por PRIMERA VEZ dispara el template
**Confirm signup**, no Magic Link. Magic Link se usa recién en los
ingresos siguientes.

O sea que si el template se pega solo en Magic Link, el primer ingreso de
cada persona nueva —justo el que importa para que alguien se sume— sigue
mandando un link.

**Por qué importa el contenido:** la pantalla `/ingresar` pide un código
numérico (hoy de 8 dígitos). El template por defecto de Supabase manda
`{{ .ConfirmationURL }}` (un link para clickear), no el código. Con el
default, el login **no se puede completar**: llega un link y la pantalla
pide números.

Este template usa `{{ .Token }}`, que es el código numérico.

Cambiar también el **Subject** de ambos a algo como
`Tu código para ingresar a lacomu`.

### Cómo comprobar que quedó bien

Sin depender de mirar la casilla: se dispara un OTP y se consulta la API
de Resend por el último email enviado. Si el cuerpo tiene un `href` de
confirmación y no un número de 8 dígitos, el template no está aplicado.

## Remitente propio (pendiente)

Hoy los emails salen del SMTP compartido de Supabase
(`noreply@mail.app.supabase.io`), que tiene dos problemas:

1. **Rate limits muy bajos** — pensado para desarrollo, no para producción.
   Con uso real se corta solo.
2. **Remitente ajeno** — un mail de login que llega desde un dominio random
   no genera confianza en una plataforma que maneja donaciones.

Para arreglarlo hace falta configurar SMTP propio en
Authentication → Settings → **SMTP Settings**. Requiere:

- Una cuenta en un proveedor transaccional (Resend tiene 3.000 emails/mes
  gratis y modo SMTP relay compatible directo).
- Verificar `lacomu.ar` en ese proveedor agregando los registros SPF y
  DKIM que te dé, en el DNS del dominio.
- Cargar host, puerto, usuario y contraseña en Supabase, con
  `no-reply@lacomu.ar` como remitente.

Esto está bloqueado hasta que `lacomu.ar` resuelva y tengamos control del
DNS.
