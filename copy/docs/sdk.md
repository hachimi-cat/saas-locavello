---
title: "SDKs"
---

# SDKs

Locavello ships typed SDKs in three languages, all wrapping the same
REST API. Scaffold them with `scripts/codegen-sdk.sh`.

## JavaScript / TypeScript

```bash
npm install @forjio/locavello
```

```ts
import { ForjioBrand } from "@forjio/locavello";

const client = new ForjioBrand({ apiKey: process.env.LOCAVELLO_KEY! });
const items = await client.things.list();
```

## Python

```bash
pip install forjio-locavello
```

```python
from forjio_locavello import ForjioBrandClient

client = ForjioBrandClient(api_key="...")
items = client.list()
```

## Go

```bash
go get github.com/hachimi-cat/locavello-go
```

```go
import forjiobrand "github.com/hachimi-cat/locavello-go"

c := forjiobrand.New(forjiobrand.Config{APIKey: "..."})
items, err := c.List(ctx, nil)
```

## CLI

```bash
npm install -g @forjio/locavello-cli
locavello auth login
```

The CLI authenticates via the Huudis device flow and stores its session
at `~/.locavello/session.json`.
