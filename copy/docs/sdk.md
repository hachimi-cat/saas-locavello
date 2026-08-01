---
title: "SDKs"
---

# SDKs

Forjio Brand ships typed SDKs in three languages, all wrapping the same
REST API. Scaffold them with `scripts/codegen-sdk.sh`.

## JavaScript / TypeScript

```bash
npm install @forjio/forjio-brand
```

```ts
import { ForjioBrand } from "@forjio/forjio-brand";

const client = new ForjioBrand({ apiKey: process.env.FORJIO_BRAND_KEY! });
const items = await client.things.list();
```

## Python

```bash
pip install forjio-forjio-brand
```

```python
from forjio_forjio_brand import ForjioBrandClient

client = ForjioBrandClient(api_key="...")
items = client.list()
```

## Go

```bash
go get github.com/hachimi-cat/forjio-brand-go
```

```go
import forjiobrand "github.com/hachimi-cat/forjio-brand-go"

c := forjiobrand.New(forjiobrand.Config{APIKey: "..."})
items, err := c.List(ctx, nil)
```

## CLI

```bash
npm install -g @forjio/forjio-brand-cli
forjio-brand auth login
```

The CLI authenticates via the Huudis device flow and stores its session
at `~/.forjio-brand/session.json`.
