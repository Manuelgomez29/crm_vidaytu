# Procedimiento de recuperación

Qué hacer cuando la base de datos de producción tiene datos perdidos, corruptos
o borrados por error.

Este documento se escribió **después de ensayar la restauración de verdad** el
5 de septiembre de 2026, no de memoria ni de la documentación. Todo lo que
aparece aquí se ejecutó sobre el proyecto de staging y funcionó.

---

## Los dos proyectos

| | Producción | Staging |
|---|---|---|
| Referencia | `gzmgnynsubocaxojzfdo` | `xwwwurfapeiulufaepdm` |
| Nombre en Supabase | `crm-vidaytu` | `crm-vidaytu-staging` |
| Región | eu-west-1 (Irlanda) | eu-west-1 (Irlanda) |
| Rama de git | `main` | `staging` |

**Antes de tocar nada, comprueba en la cabecera del panel de Supabase cuál de
los dos tienes abierto.** Es el único error de este procedimiento que no tiene
arreglo.

---

## Antes de restaurar: para y piensa

Una restauración **no añade, sustituye**. Devuelve la base al estado de la
copia y descarta todo lo posterior. Si el problema afecta a diez registros, casi
nunca compensa: perderías el trabajo de todo el día para recuperar diez filas.

Pregúntate en este orden:

1. **¿Se puede arreglar con una consulta?** Un `update` mal filtrado a menudo se
   revierte con otro `update`, sobre todo si la tabla tiene `updated_at` y la
   auditoría guarda los valores anteriores (tabla `auditoria`, columna
   `datos_anteriores`). Mira ahí antes que nada.
2. **¿Cuántos datos se han perdido y cuántos se perderían al restaurar?** Las
   copias se toman sobre las **01:30 UTC**. Restaurar a las 18:00 significa
   descartar unas 16 horas de trabajo del equipo comercial.
3. **¿Está el equipo trabajando ahora mismo?** Si siguen entrando datos mientras
   decides, la cuenta sube. Considera avisar de que paren.

Si tras esto la restauración sigue siendo la mejor opción, continúa.

---

## Restaurar producción

### 1. Anota el estado actual

Sirve para demostrar después que la restauración hizo algo, y para saber qué
falta reconstruir.

```bash
npm run verificar
```

Y apunta los totales: casos, contactos, usuarios, migraciones aplicadas.

### 2. Lanza la restauración desde el panel

**No se puede hacer por API.** El endpoint existe pero Supabase lo tiene
deshabilitado (`This endpoint is unavailable at the moment`), a propósito: es la
operación más destructiva que hay y no la quieren accesible con un token.

```
https://supabase.com/dashboard/project/gzmgnynsubocaxojzfdo/database/backups/scheduled
```

Elige la copia por fecha y pulsa **Restore**. Pedirá confirmación escribiendo el
nombre del proyecto.

El proyecto queda **fuera de servicio** mientras dura, típicamente unos minutos.
La aplicación en Vercel seguirá en pie pero dará errores: es normal y se
recupera solo cuando la base vuelve.

### 3. Comprueba qué ha vuelto

```bash
npm run verificar
```

Compara con lo que anotaste. Si los números han cambiado, la restauración fue
real.

### 4. Reaplica lo que falte del esquema

**Esto es lo que casi nadie prevé.** Si la copia es anterior a alguna migración,
la base vuelve con un esquema viejo y la aplicación —que sí está actualizada— no
encaja con él.

Mira qué migraciones quedaron registradas:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Compara con los ficheros de `supabase/migrations/` y aplica **solo las que
falten**, en orden. Es la razón por la que el esquema vive en git y no solo
dentro de la base: sin eso, una restauración a un punto anterior te deja con una
aplicación que no puede arrancar.

### 5. Verifica que el modelo de permisos sigue en pie

```bash
npm run verificar:seguridad
npm run verificar:muro
npm run verificar:retencion
```

Las tres tienen que pasar. Una restauración devuelve también las políticas RLS,
así que si la copia es anterior a un arreglo de seguridad, **el agujero vuelve
con ella**. Estas baterías lo detectan.

### 6. Comprueba las claves de API

En el ensayo del 5 de septiembre **las claves sobrevivieron a la restauración**,
porque no viven dentro de la base. Aun así, confírmalo: están escritas a mano en
las variables de entorno de Vercel, y si alguna vez cambiaran, el despliegue
fallaría en silencio.

```bash
npm run verificar
```

Si conecta, las claves valen.

---

## Ensayar en staging

**Antes de restaurar producción por primera vez en una situación real, ensaya en
staging.** Es desechable y el procedimiento es idéntico.

```
https://supabase.com/dashboard/project/xwwwurfapeiulufaepdm/database/backups/scheduled
```

Para reconstruirlo después:

```bash
npm run staging:seed
npm run staging:verificar
npm run staging:verificar:seguridad
npm run staging:verificar:muro
npm run staging:verificar:retencion
```

Si la restauración deja staging vacío, hay que aplicar antes las 25 migraciones
de `supabase/migrations/` en orden.

---

## Qué NO cubre una copia de seguridad

- **Los ficheros de Storage** (documentos clínicos, adjuntos de casos) no van en
  la copia de la base de datos. Se gestionan aparte.
- **Las variables de entorno de Vercel.** Si se pierden, hay que volver a
  ponerlas a mano; los valores están en `.env.local` y `.env.staging`, que nunca
  se suben a git.
- **El código.** Vive en GitHub (`Manuelgomez29/crm_vidaytu`).

---

## Limitaciones conocidas

**Sin PITR, la pérdida máxima es de un día.** El plan Pro incluye copias diarias
con 7 días de retención. No hay punto de restauración intermedio: solo se puede
volver a una de esas siete fotos, tomadas sobre las 01:30 UTC.

El complemento PITR (100 $/mes por 7 días de retención) permite volver a
cualquier segundo. Se valoró el 5 de septiembre de 2026 y se decidió esperar:
lo urgente era pasar de *ninguna copia* a *copias diarias*. Conviene revisar la
decisión cuando el volumen de casos reales haga que perder un día de trabajo
comercial cueste más de 100 $ al mes.

---

## Registro de ensayos

| Fecha | Entorno | Resultado |
|---|---|---|
| 2026-09-05 | staging | Restauración correcta a un estado vacío. Reconstrucción completa: 25 migraciones, siembra y las cuatro baterías pasando. Las claves de API sobrevivieron. |

**Anota aquí cada ensayo.** Una copia que nunca has restaurado no es una copia,
es una suposición; y una que restauraste hace dos años, tampoco. Conviene
repetir el ensayo al menos una vez al año, y siempre después de un cambio grande
en el esquema.
