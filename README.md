# VisionQC Mobile

Aplicación web mobile-first para inspección visual con cámara iPhone y clasificación basada en TensorFlow.js, MobileNet y KNN.

## Publicación en Vercel

1. Sube estos archivos a un repositorio GitHub, por ejemplo `readytodeploy/visionqc-mobile`.
2. En Vercel, selecciona **Add New > Project > Import Git Repository**.
3. Framework preset: **Other**. No necesitas build command.
4. Deploy. Safari iOS accederá a la cámara porque el dominio `*.vercel.app` utiliza HTTPS.

## Uso

1. Permite el acceso a la cámara.
2. Captura al menos tres ejemplos OK y tres KO para calibración (se recomiendan más).
3. Inspecciona manualmente o usa el modo automático.

**Limitaciones:** este clasificador es una demo calibrable, no un detector industrial validado. No identifica cada pieza de manera única. La calibración se pierde al cerrar la sesión y usa bibliotecas CDN, por lo que requiere acceso a internet en su primer uso.