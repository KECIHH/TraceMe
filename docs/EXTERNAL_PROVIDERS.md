# 外部服务 Provider

TraceMe 把地图、天气和汇率能力放在 provider 接口后面。未配置外部服务时，应用应继续可用，并通过 none/mock provider 降级。

外部数据只作为旅行参考，不能替代官方票务、天气预警、酒店、签证、保险或金融信息。

## Provider 类型

- `MapProvider`: 为地点生成静态地图数据和外部导航链接。
- `WeatherProvider`: 查询天气预报，并写入 `WeatherSnapshot` 作为缓存和回退。
- `ExchangeRateProvider`: 查询汇率，并写入 `CurrencyRate` 作为缓存和手动回退。

工厂函数位于 `src/lib/external`：

- `createMapProvider`
- `createWeatherProvider`
- `createExchangeRateProvider`
- `getMapProviderHealth`
- `getWeatherProviderHealth`
- `getExchangeRateProviderHealth`

## 环境变量

安全默认值：

```env
MAP_PROVIDER="none"
WEATHER_PROVIDER="none"
EXCHANGE_RATE_PROVIDER="none"
```

本地演示和 E2E：

```env
MAP_PROVIDER="mock"
WEATHER_PROVIDER="mock"
EXCHANGE_RATE_PROVIDER="mock"
```

可选 live provider：

```env
WEATHER_PROVIDER="open-meteo"
EXCHANGE_RATE_PROVIDER="open-exchange-rates"
OPEN_EXCHANGE_RATES_APP_ID="server-side-key"
```

地图相关：

```env
MAP_PROVIDER="static"
NEXT_PUBLIC_MAP_PROVIDER=""
MAP_PUBLIC_API_KEY_EXPOSED="false"
```

`OPEN_EXCHANGE_RATES_APP_ID` 只在服务端读取，不能暴露给客户端。

## 地图 Key

当前地图 MVP 不需要浏览器地图 SDK，也不需要把服务端 Key 发到前端。

如果未来接入需要浏览器 Key 的地图服务：

- 只能使用 provider 明确允许暴露在浏览器的 public key。
- 必须在 provider 控制台限制允许域名。
- 不能把 server-side API key 放入 `NEXT_PUBLIC_*`。
- 不能在日志中打印完整 Key。

## 天气

`open-meteo` 不需要服务端 API Key。天气查询结果写入 `WeatherSnapshot`，API 失败时页面应继续渲染，并尝试使用最新缓存。无缓存时，用户可手动记录天气备注。

## 汇率

`open-exchange-rates` 使用服务端 `OPEN_EXCHANGE_RATES_APP_ID`。汇率结果写入 `CurrencyRate`。API 失败时，预算页面应使用最新缓存或允许用户手动输入汇率。

## 新增 Provider

新增 provider 时：

1. 实现对应接口。
2. 在 provider factory 中按环境变量选择。
3. 增加 provider health 状态。
4. 增加单元测试。
5. 更新 `.env.example` 和本文档。
6. 确认错误日志不会泄露 Key、URL query 中的 token 或第三方响应中的敏感字段。

## 缓存和降级

- 天气缓存：`WeatherSnapshot`。
- 汇率缓存：`CurrencyRate`。
- provider 失败不应导致整页崩溃。
- UI 必须提示外部数据仅供参考。
- 手动输入的数据应标记为 manual 或 notes，避免和 live provider 数据混淆。

## 测试覆盖

相关测试位于：

- `tests/unit/stage17-external-data.test.ts`
- `tests/e2e/stage17-external-data.spec.ts`
