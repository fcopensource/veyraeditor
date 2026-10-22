<p align="center">
  <img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/mongodb/media/readme/hero.png" alt="Veyra Query Lens for MongoDB: a query's full collection scan, the numbers, and the index that fixes it as Mongoose code" width="100%">
</p>

# Veyra Query Lens for MongoDB

**See how every MongoDB query performs, right above your code.**

Slow queries usually show up in production, long after the code was written. Query Lens shows them while you write it. It runs `explain()` for each query in your code against your development database, and puts the answer above the line:

```
⚠ Full collection scan · 48,210 read → 20 returned · 212 ms   |   Create index { customerId: 1, createdAt: -1 }
const recent = await Order.find({ customerId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20);
```

One click creates the index, and the lens turns green. **Free, no account, nothing sent anywhere.** By the makers of [Veyra Studio](https://veyraeditor.com).

- 🔍 **A lens above every query:** documents read vs returned, time, and whether an index is used. Full collection scans and in-memory sorts are flagged.
- 🛠️ **The index that fixes it,** using MongoDB's Equality, Sort, Range rule. Create it in one click, or copy it as Mongoose, Node.js, Python or mongosh code.
- 🩺 **Index Doctor:** the indexes your code is missing, and the ones nothing uses or that duplicate another, with their size.
- 🧬 **Schema drift:** your Mongoose schemas compared with real documents: wrong types, missing required fields, and fields Mongoose silently drops.
- 🧠 **Works on real app code:** values that only exist at run time (`req.params.id`) are filled with real values from the collection, so you see the plan your app really gets.
- 🔒 **Safe by design:** explain only, with a time limit. Nothing is written unless you confirm, and there's a read-only mode.

**[Read the full guide →](https://github.com/fcopensource/veyraeditor/blob/main/extensions/mongodb/docs/GUIDE.md)**

---

## Quick start

1. Have a development database running: local, Docker or Atlas.
2. Open your project. If its `.env` has a local connection string (`MONGODB_URI=mongodb://localhost:27017/shop`), Query Lens connects by itself. Otherwise run **MongoDB Lens: Connect to MongoDB…**.
3. Open a file with queries. Each one gets a lens. Click a lens for the full details.
4. Run **MongoDB Lens: Open Index Doctor** for the whole picture.

Your connection string is kept in VS Code's secret storage, never in settings.

## Every query, measured where you write it

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/mongodb/media/readme/lens.png" alt="A TypeScript file with lenses above four queries: a full collection scan with a Create index button, two that use an index, and an in-memory sort" width="100%">

| Lens | Meaning |
|---|---|
| `✓ Uses index …` | Reads about as many documents as it returns. |
| `ℹ Full collection scan` / `Sorts in memory` | Fine at today's size, but it won't stay fast. |
| `⚠ Full collection scan` / `Sorts in memory` / `Index isn't selective` | Reads 1,000+ documents without a good index. Also listed in **Problems**, with quick fixes. |

Queries are checked automatically on a database on your computer, and with a click (**▶ Check this query**) anywhere else. **Check All Queries** checks the whole workspace.

## The fix, not just the problem

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/mongodb/media/readme/query.png" alt="Query details: the query from the code, the verdict with documents read, keys read, returned, time and plan, the suggested index with a Create button, and the code to add it in Mongoose, Node.js, Python or mongosh" width="100%">

Click a lens to see the plan, the numbers, the exact command that was run, and the suggested index. Create it on your development database, then paste it into your code so every environment gets it:

```js
orderSchema.index({ customerId: 1, createdAt: -1 });
```

## Index Doctor

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/mongodb/media/readme/doctor.png" alt="Index Doctor: one missing index needed by two queries, an index used 0 times and a duplicate index, every collection's indexes with size and use, and Mongoose schemas compared with the data" width="100%">

- **Missing indexes**, with the queries that need each one.
- **Indexes nothing uses** (0 uses since the server started, and no query in your code needs them) and **duplicates** (another index starts with the same fields). Every index slows down writes.
- Every collection's indexes, with size, use count, and which queries in your code use them.

## Your schema vs. your real data

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/mongodb/media/readme/schema.png" alt="A Mongoose schema with underlined fields, and Problems: price is a string in 12% of documents, sku is missing in 0.8%, phone is not in the schema, discontinued is in no documents" width="100%">

**Check Schema Against Data** samples real documents and compares them with each Mongoose schema. Findings appear on the schema lines themselves.

## Supported code

| | |
|---|---|
| **Node.js driver** | `db.collection("orders").find(…).sort(…).limit(…)`, `findOne`, `countDocuments`, `aggregate([{ $match }, { $sort }])`, `updateMany`… |
| **Mongoose** | `Order.find(…)`, `.sort("-createdAt")`, `exists`, models from any file, with Mongoose's collection naming |
| **PyMongo / Motor** | `db.orders.find(…).sort("created_at", DESCENDING)`, `find_one`, `count_documents`, `sort=` and `limit=` keywords |

Updates and deletes are never run: Query Lens checks the `find()` that selects the same documents. If a query is matched to the wrong collection, add `// veyra-collection: orders` above it.

## Safety

- Only `explain()`, `findOne()` (to sample a value), and index and collection statistics are run, each with a time limit (`veyraMongo.maxTimeMS`, 3 s).
- Indexes are created or dropped only when you confirm, with the database's address shown. `veyraMongo.readOnly` turns that off entirely.
- On databases that aren't on your computer, queries are checked only when you click (`veyraMongo.analyze`).
- No account, no telemetry. It talks only to the database you connect.

## Settings

| Setting | Default | |
|---|---|---|
| `veyraMongo.analyze` | `local` | Check automatically on local databases (`local`), always (`always`), or on click (`onClick`) |
| `veyraMongo.readOnly` | `false` | Never create or drop indexes from VS Code |
| `veyraMongo.maxTimeMS` | `3000` | Time limit for each explain |
| `veyraMongo.sampleSize` | `1000` | Documents sampled for the schema check |
| `veyraMongo.problems` | `true` | List findings in the Problems panel |

## Learn more

The **[full guide](https://github.com/fcopensource/veyraeditor/blob/main/extensions/mongodb/docs/GUIDE.md)** covers how values are sampled, the index rule, every supported pattern, Index Doctor's caveats, troubleshooting, and how Query Lens works inside. It's also at [veyraeditor.com/mongodb/docs](https://veyraeditor.com/mongodb/docs).

Found a bug or have an idea? [Open an issue](https://github.com/fcopensource/veyraeditor/issues). MIT licensed.

*MongoDB is a trademark of MongoDB, Inc. Veyra Query Lens is an independent extension and is not made or endorsed by MongoDB, Inc.*
