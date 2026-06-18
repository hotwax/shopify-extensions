# App Home Extension

App home extensions let app developers render custom UI directly inside the Shopify Admin. Use this extension to build the landing experience for your app — surfacing the merchant-facing pages, navigation, and workflows that your app provides.

Learn more about app home extensions in Shopify's [developer documentation](https://shopify.dev/docs/api/app-home).

---

## Get started with this extension

This extension demonstrates a multi-page app rendered at `admin.app.home.render`. After deployment, merchants can install your app and interact with it directly in the Shopify Admin.

### Key files

- `src/AppHome.jsx` - Main extension entry point that mounts the Preact app and configures routing
- `src/pages/` - Individual route components rendered by the router
- `shopify.extension.toml` - Extension configuration defining the render target and access scopes
- `locales/` - Translations for the extension's merchant-facing strings

### How it works

1. The extension registers an app home target with `[[extensions.targeting]]` pointing at `admin.app.home.render`
2. When a merchant opens your app in the Shopify Admin, Shopify renders this extension
3. The extension uses [Polaris web components](https://shopify.dev/docs/api/app-home/web-components) to build the UI and [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access) to query the Admin GraphQL API

### Customizing the extension

1. Update the merchant-facing name in `locales/en.default.json`
2. Update `scopes` in `shopify.extension.toml` to declare the access scopes your app needs
3. Replace the example pages in `src/pages/` with your app's workflows

### Testing

Run `shopify app dev` to preview your extension locally, or `shopify app deploy` to deploy it to a development store.
