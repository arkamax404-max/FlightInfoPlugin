# Flight Info for Ulanzi D200

A runnable UlanziStudio Node.js plugin foundation that displays flight status on one D200 keypad action.

## Setup

1. Use Node.js 20 or newer.
2. Run `npm run check`, `npm test`, and `npm run build`.
3. Run `npm run package`; import `com.ulanzi.flightinfo.ulanziPlugin/package/com.ulanzi.flightinfo.ulanziPlugin.zip` into UlanziStudio.
4. Add **Flight Status** to a D200 key and configure its flight identifier, date, and personal AirLabs API key in the Property Inspector. Pressing the key manually refreshes it.

## AirLabs setup

Flight Info uses the personal-use AirLabs flight endpoint. An AirLabs API key is required for flight updates. Enter your own key in the password field; it is persisted with the key configuration, immediately cleared from the input after saving, and only shown as a configured/masked indicator. Use **Clear saved API key** to remove it. Without a configured key, the plugin shows its unavailable state and does not make a request. Do not place API keys in source, documentation, defaults, or logs.

AirLabs is queried by `flight_iata`; its single-flight endpoint returns the closest matching flight, so the configured flight date is not a date-exact AirLabs lookup. The D200 dynamic image uses five lines: flight code; bold departure airport and schedule (`SVQ 06:50`); bold arrival airport and schedule (`ORY 09:20`); a state label; and a large bold value. Scheduled and en-route flights use `TIME LEFT` with the remaining duration, delayed flights use `DELAYED` with the delay, and landed flights use `STATUS` with `LANDED`. IATA airport codes are normalized when present; ICAO codes or `---` placeholders safely cover missing airport data. Loading and unavailable states retain their static fallback icons.

Physical D200 buttons use generated base64 SVG images for flight details because host-rendered text metadata is not reliable on the device. When AirLabs has no data, the dynamic image keeps the configured flight code and date and shows `NO DATA`; loading retains its static fallback icon.

## Polling and AirLabs quota

Automatic requests are limited per configured D200 key to protect personal AirLabs quotas:

| Situation | Automatic refresh |
| --- | --- |
| Before or after the configured local flight date | Disabled; use the key for a manual refresh. |
| Flight date, normal state | Every 60 minutes (24 requests per full day at this cadence). |
| From 3 hours before departure through 3 hours after arrival | Every 15 minutes (4 requests per hour). |
| Flight reported as `LANDED` | Disabled; the final flight details remain visible. |

The plugin performs one initial automatic refresh when a new or changed configuration applies to the current local flight date. Manual key presses always refresh immediately. Concurrent refreshes for the same key are prevented, and changing the flight, date, or API key resets the schedule. The precise usage depends on the flight duration and manual refreshes; do not use the old 30-second polling interval, which would consume 2,880 requests per day for one active key.

## Architecture and limitations

`FlightProvider` defines the normalized flight query boundary. `AirLabsFlightProvider` maps the AirLabs response to normalized flight data and typed unavailable outcomes. The AirLabs API key and request URL are never logged or included in UI status/error text.

The bundled WebSocket client implements the Ulanzi host connection needed by this foundation. It has not been exercised against a physical D200 in this repository; verify a configured personal key and display layout on hardware before relying on it for travel.
