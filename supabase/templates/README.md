# Emails de autenticación

Supabase no permite versionar los templates de email desde el repo: se
cargan a mano en el dashboard. Se guardan igual acá porque son parte del
flujo de auth — si viven solo en el dashboard, nadie los ve en un diff.

## magic-link.html

**Dónde va:** Supabase → Authentication → Email Templates → **Magic Link**

**Por qué importa:** la pantalla `/ingresar` pide un código numérico (hoy de 8 dígitos).
El template por defecto de Supabase manda `{{ .ConfirmationURL }}` (un
link para clickear), no el código. Con el default, el login **no se puede
completar**: llega un link y la pantalla pide números.

Este template usa `{{ .Token }}`, que es el código numérico.

Cambiar también el **Subject** a algo como `Tu código para ingresar a lacomu`.

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
