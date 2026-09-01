# Flight Info for Ulanzi D200

A runnable UlanziStudio Node.js plugin foundation that displays flight status on one D200 keypad action.

## Setup

1. Use Node.js 20 or newer.
2. Run `npm run check`, `npm test`, and `npm run build`.
3. Run `npm run package`; import `com.ulanzi.flightinfo.ulanziPlugin/package/com.ulanzi.flightinfo.ulanziPlugin.zip` into UlanziStudio.
4. Add **Flight Status** to a D200 key and configure its flight identifier, date, and provider in the Property Inspector. Pressing the key manually refreshes it.

## Providers

**Simulation** is the default and makes no network calls. Its configured scenario produces deterministic `ON TIME`, `+45M`, and `NO DATA` states.

Select **AirLabs** to use the personal-use AirLabs flight endpoint. Enter your own API key in the password field; it is persisted with the key configuration, immediately cleared from the input after saving, and only shown as a configured/masked indicator. Use **Clear saved API key** to remove it. Do not place API keys in source, documentation, defaults, or logs.

AirLabs is queried by `flight_iata`; its single-flight endpoint returns the closest matching flight, so the configured flight date is not a date-exact AirLabs lookup. The D200 dynamic image uses five lines: flight code; bold departure airport and schedule (`SVQ 06:50`); bold arrival airport and schedule (`ORY 09:20`); a state label; and a large bold value. Scheduled and en-route flights use `TIME LEFT` with the remaining duration, delayed flights use `DELAYED` with the delay, and landed flights use `STATUS` with `LANDED`. IATA airport codes are normalized when present; ICAO codes or `---` placeholders safely cover missing airport data. Loading and unavailable states retain their static fallback icons.

Physical D200 buttons use generated base64 SVG images for flight details because host-rendered text metadata is not reliable on the device. Loading, unavailable, and fallback states continue to use their static manifest icons.

## Architecture and limitations

`FlightProvider` is the provider-neutral boundary. `SimulatedFlightProvider` remains available only through explicit simulation mode; `AirLabsFlightProvider` maps the AirLabs response to normalized flight data and typed unavailable outcomes. The AirLabs API key and request URL are never logged or included in UI status/error text.

The bundled WebSocket client implements the Ulanzi host connection needed by this foundation. It has not been exercised against a physical D200 in this repository; verify a configured personal key and display layout on hardware before relying on it for travel.
