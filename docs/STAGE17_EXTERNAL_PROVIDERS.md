# Stage 17 External Providers

TraceMe keeps maps, weather, and exchange rates behind provider interfaces:

- `MapProvider`: local/static map rendering plus external navigation URLs.
- `WeatherProvider`: forecast lookup with database snapshots for cache/fallback.
- `ExchangeRateProvider`: currency quotes with database snapshots and manual fallback.

All external data shown in the UI must be treated as reference only and manually verified.

## Environment

Use safe defaults when no API is configured:

```env
MAP_PROVIDER="none"
WEATHER_PROVIDER="none"
EXCHANGE_RATE_PROVIDER="none"
```

For local demos and E2E:

```env
MAP_PROVIDER="mock"
WEATHER_PROVIDER="mock"
EXCHANGE_RATE_PROVIDER="mock"
```

Optional live providers:

```env
WEATHER_PROVIDER="open-meteo"
EXCHANGE_RATE_PROVIDER="open-exchange-rates"
OPEN_EXCHANGE_RATES_APP_ID="server-side-key"
```

`OPEN_EXCHANGE_RATES_APP_ID` is read only on the server and must not be exposed to client components.

## Map Keys

The MVP map can render points without a browser map SDK. If a future provider needs a browser key, only use a public key that the provider expects to run in the browser, and restrict it by allowed domain in the provider console.

Never send server-side API keys to the frontend.

## Switching Providers

Provider factories live in `src/lib/external`:

- `createMapProvider`
- `createWeatherProvider`
- `createExchangeRateProvider`

Add a new provider by implementing the matching interface, then selecting it from the factory based on an environment variable. Keep API-key logging out of errors and logs.

## Cache And Fallback

Weather snapshots are stored in `WeatherSnapshot`. Exchange rates are stored in `CurrencyRate`.

When an API call fails, pages continue rendering and actions try the newest cached snapshot. If no cache exists, the UI prompts for manual weather notes or manual exchange rates.
