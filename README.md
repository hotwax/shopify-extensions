# Shopify App Template - Extension Only

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [Preact](https://preactjs.com/) and [Vite](https://vite.dev/). It uses Shopify's [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access) and [App Bridge](https://shopify.dev/docs/api/app-bridge) to make authenticated calls to the Shopify Admin API directly from the browser — no server required.

Rather than cloning this repo, follow the [Quick Start steps](#quick-start) below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-extension-only
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [Shopify CLI](https://shopify.dev/docs/apps/build/cli-for-apps/test-apps-locally). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

## How it works

### Authentication

This template uses [Shopify managed installation](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation). Shopify handles the OAuth flow and app installation automatically. Once installed, the app is fully embedded in the Shopify Admin.

### Querying data

This template uses [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access) — the Shopify Admin API is called directly from the browser using App Bridge. No server-side code is needed.

This template comes pre-configured with examples of querying data using GraphQL with direct API access, and using [metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects) to store and retrieve structured app data — see [/shared/models/faq.ts](./shared/models/faq.ts).

### App Bridge

[App Bridge](https://shopify.dev/docs/api/app-bridge) is loaded automatically in embedded apps.

### Polaris Web Components

This template uses [Polaris Web Components](https://shopify.dev/docs/api/app-home/web-components) — the native custom element version of Polaris that works in any framework (including Preact). No additional package installation is required as they are provided automatically in the Shopify Admin iframe.

## GraphQL Codegen

This template is pre-configured with [GraphQL Codegen](https://the-guild.dev/graphql/codegen) to generate TypeScript types from your GraphQL queries.

To regenerate types after updating queries:

```shell
npm run codegen
```

To watch for changes:

```shell
npm run codegen:watch
```

## Build

Build the app by running:

Using npm:

```shell
npm run build
```

Using yarn:

```shell
yarn build
```

Using pnpm:

```shell
pnpm run build
```

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot), [Claude Code](https://claude.com/product/claude-code), and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Metafields and Metaobjects

This template uses [metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects) and [metafields](https://shopify.dev/docs/apps/custom-data/metafields) to store structured app data without a custom database.

### Metaobject: FAQ

The template defines a `faq` metaobject type for storing FAQ entries. Each FAQ has a question, answer, a flag to control visibility on the FAQ page, and optional product associations.

Defined in `shopify.app.toml`:

```toml
[metaobjects.app.faq]
name = "FAQ"

[metaobjects.app.faq.fields.question]
name = "Question"
type = "single_line_text_field"
required = true

[metaobjects.app.faq.fields.answer]
name = "Answer"
type = "multi_line_text_field"
required = true

[metaobjects.app.faq.fields.show_on_faq_page]
name = "Show on FAQ page"
type = "boolean"

[metaobjects.app.faq.fields.products]
name = "Products"
type = "list.product_reference"
```

### Metafield: Product FAQ

A metafield definition links individual products to a FAQ metaobject entry, allowing merchants to associate a FAQ with specific products.

```toml
[product.metafields.app.faq]
name = "FAQ"
description = "FAQ for this product"
type = "metaobject_reference<$app:faq>"
access.admin = "merchant_read_write"
```

These definitions are automatically synced to Shopify when you run `shopify app dev` or `shopify app deploy`. See [/shared/models/faq.ts](./shared/models/faq.ts) for the client-side model that reads and writes these metaobjects via the Admin GraphQL API.

## Resources

Preact & Vite:

- [Preact docs](https://preactjs.com/guide/v10/getting-started)
- [Vite docs](https://vite.dev/)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/web-components)
- [Metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects)
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)
