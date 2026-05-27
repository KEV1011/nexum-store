# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [1.0.0] - 2025-05-27

### Añadido
- Autenticación mock con OTP de 6 dígitos (código hardcoded: 123456)
- Pantalla principal con mapa Google Maps centrado en Pamplona, Norte de Santander
- Toggle en línea/desconectado con simulación de solicitudes de viaje
- Flujo completo de viaje: recepción → aceptar → camino al pasajero → inicio → finalización
- Pantalla de resumen de ganancias del día con histórico de 7 días
- Perfil del conductor con información del vehículo
- 10 viajes mock con coordenadas reales del casco urbano de Pamplona
- 5 pasajeros mock con nombres típicos de la región
- Soporte completo para modo claro y oscuro (Material 3)
- Internacionalización en español Colombia (estructura lista para inglés)
- Configuración de permisos Android e iOS para geolocalización

### Datos del conductor mock
- Juan Carlos Villamizar Contreras | Chevrolet Spark GT 2020 | Placa KGB-742
- Calificación: 4.87 ⭐

### Tarifas
- Base: $3.500 COP | Por km: $800 COP | Por minuto: $150 COP | Mínima: $5.000 COP
