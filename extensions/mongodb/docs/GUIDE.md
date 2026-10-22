# Veyra Query Lens for MongoDB: User Guide

Query Lens shows how every MongoDB query in your code performs, right above the line that runs it. It tells you when a query reads the whole collection or sorts in memory, suggests the index that fixes it, finds indexes nothing uses, and compares your Mongoose schemas with the documents really in your database.

This guide covers everything it does and how it works. For a short tour, see the [README](../README.md).

## Contents

1. [Before you start](#1-before-you-start)
2. [Connecting to a database](#2-connecting-to-a-database)
3. [The lens above each query](#3-the-lens-above-each-query)
4. [Index suggestions](#4-index-suggestions)
5. [Supported code](#5-supported-code)
6. [Index Doctor](#6-index-doctor)
7. [Schema drift](#7-schema-drift)
8. [Safety and privacy](#8-safety-and-privacy)
9. [Commands](#9-commands)
10. [Settings](#10-settings)
11. [Troubleshooting](#11-troubleshooting)
12. [How it works](#12-how-it-works)

---

## 1. Before you start

You need:

- VS Code 1.85 or newer.
- A project that uses MongoDB from **Node.js** (the official `mongodb` driver or **Mongoose**) or **Python** (**PyMongo** or **Motor**).
- A **development** database that Query Lens can connect to: MongoDB 4.4 or newer, on your computer, in Docker, or in Atlas.

The more your development data looks like production, the more useful the results. Plans depend on the data: a query that reads 50 documents on a laptop may read 5 million in production. Query Lens points this out (see [levels](#levels)), but a copy of real data, with personal information removed, gives the truest picture.

## 2. Connecting to a database

### Automatically, from .env

If a `.env` file in your project has a connection string to a database **on your computer** (for example `MONGODB_URI=mongodb://localhost:27017/shop`), Query Lens connects to it by itself when you open the project. The status bar shows `$(database) localhost:27017/shop`.

"On your computer" means `localhost`, `127.0.0.1`, `::1`, `host.docker.internal`, `*.local`, or a single-word host like `mongo` (a Docker Compose service). Connection strings to other hosts, including Atlas (`mongodb+srv://`), are never used without asking.

Template files such as `.env.example` are ignored.

### By hand

Run **MongoDB Lens: Connect to MongoDB…** from the Command Palette (or click the status bar, or the **Connect** button in the sidebar). You can:

- pick a connection string found in your `.env` files (shown with the password hidden), or
- enter one, like `mongodb://localhost:27017/myapp` or `mongodb+srv://user:pass@cluster0.example.mongodb.net/myapp`.

If the connection string doesn't name a database, Query Lens asks which one your app uses. To switch databases later, run **Connect to MongoDB…** again and choose **Use another database…**.

### Where the connection string is kept

In VS Code's **secret storage** (your operating system's keychain), separately for each workspace. It is never written to settings files, so it can't be committed by accident. **MongoDB Lens: Disconnect** forgets it.

## 3. The lens above each query

Once connected, every query in your code gets a line above it:

```
⚠ Full collection scan · 48,210 read → 20 returned · 212 ms   |   Create index { customerId: 1, createdAt: -1 }
const recent = await Order.find({ customerId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20);
```

- **48,210 read** is how many documents MongoDB examined.
- **20 returned** is how many it sent back.
- **212 ms** is how long it took on your development database.

Click the lens for the **Query details** panel: the full plan, the numbers, the exact command that was run, and the suggested index as code for Mongoose, Node.js, Python and mongosh.

### Levels

| | Meaning |
|---|---|
| `✓` **Good** | The query uses an index well: it reads about as many documents as it returns. |
| `ℹ` **Worth a look** | Fine at today's size, but it won't stay fast: a full collection scan or in-memory sort over fewer than 1,000 documents. |
| `⚠` **Needs an index** | A full collection scan or in-memory sort over 1,000 documents or more, or an index that still reads more than 10 times what it returns. These are also listed in the **Problems** panel. |

### What each title means

- **Full collection scan:** no index helps, so MongoDB reads every document (`COLLSCAN`). This gets slower as the collection grows.
- **Sorts in memory:** an index finds the documents, but MongoDB sorts them in memory (a `SORT` stage). That's slow for large results: sorts over 100 MB spill to disk, or fail when disk use isn't allowed.
- **Index isn't selective:** an index is used, but MongoDB still reads many documents it then throws away.
- **Uses index _name_:** all good.
- **Finds by _id:** looking up a single document by `_id`, which is always fast.

### When queries are checked

By default (`veyraMongo.analyze` = `local`), queries are checked **automatically** when the database is on your computer, and **when you click ▶ Check this query** on any other database. You can choose `always` or `onClick` instead.

**MongoDB Lens: Check All Queries** checks every query in the workspace at once, which is useful before a release.

### How values from your code are handled

Most queries use values that only exist when the app runs, like `{ customerId: req.params.id }`. To get the plan your app really gets, Query Lens reads one real value of that field from the collection (`findOne({ customerId: { $exists: true, $ne: null } })`) and uses it in the query. For `$in`, `$nin` and `$all` it uses an array with one real value. The **Query details** panel lists which fields were filled this way.

## 4. Index suggestions

When a query needs an index, Query Lens suggests one using MongoDB's **Equality, Sort, Range** rule:

1. **Equality:** fields matched exactly (`status: "paid"`, `$eq`, `$in`) come first.
2. **Sort:** then the fields you sort on, in the same direction.
3. **Range:** then range conditions (`$gt`, `$gte`, `$lt`, `$lte`, a `^prefix` regex), then `$exists`, `$ne` and other regexes.

For example:

```js
Order.find({ status: "paid", createdAt: { $gte: since } }).sort({ total: -1 })
// suggested index: { status: 1, total: -1, createdAt: 1 }
```

No index is suggested when one that starts with the same fields already exists. An index can be read in both directions, so `{ a: 1, b: -1 }` also serves `{ a: -1, b: 1 }`.

### Creating the index

Click **Create index {…}** on the lens, use the quick fix in the Problems panel (`Ctrl+.`), or press **Create** in Query details or Index Doctor. You're asked to confirm, with the database's address shown. After it's built, the query is checked again and you see the difference, for example *"The query now reads 20 documents to return 20."*

### Adding it to your code

Creating an index on your development database doesn't put it in production. Add it to your code as well; Query Lens offers it in four forms:

```js
// Mongoose (in the schema file)
orderSchema.index({ customerId: 1, createdAt: -1 });
```
```js
// Node.js driver (in a migration or start-up script)
await db.collection("orders").createIndex({ customerId: 1, createdAt: -1 });
```
```python
# Python
db["orders"].create_index([("customerId", ASCENDING), ("createdAt", DESCENDING)])
```
```js
// mongosh
db.getCollection("orders").createIndex({ customerId: 1, createdAt: -1 })
```

## 5. Supported code

### Libraries

| Library | Example |
|---|---|
| Node.js driver | `db.collection("orders").find({ … }).sort({ … }).limit(20)` |
| Mongoose | `Order.find({ … }).sort("-createdAt").limit(20).lean()` |
| PyMongo / Motor | `db.orders.find({ … }).sort("created_at", DESCENDING).limit(20)` |

JavaScript, TypeScript (including `.jsx`, `.tsx`, `.mjs`, `.cjs`) and Python files are read.

### Methods

`find`, `findOne`, `countDocuments`, `count`, `exists`, `distinct`, `aggregate`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, and the Python forms (`find_one`, `count_documents`, `update_many`, …).

Updates and deletes are **never run**. Query Lens checks the `find()` that selects the same documents, because that's the part an index speeds up.

### Sorting and limits

All of these are understood: `.sort({ a: -1 })`, `.sort([["a", -1]])`, `.sort("-a b")` (Mongoose), `.sort("a", -1)` and `.sort([("a", DESCENDING)])` (Python), the `sort` and `limit` options of `find()`, Python's `sort=` and `limit=` keywords, and `.limit(n)`.

### Aggregation pipelines

A pipeline is checked by the stages it starts with: `$match` (one or more), then `$sort` and `$limit`. A pipeline that doesn't start with `$match` reads every document by design, and the lens says so.

### How the collection is found

In this order:

1. A comment on the line above, or the same line: `// veyra-collection: orders` (or `# veyra-collection: orders` in Python).
2. The call itself: `db.collection("orders")`, `db.get_collection("orders")`, `db["orders"]`.
3. A Mongoose model: `Order.find(…)` where `Order = mongoose.model("Order", schema)` anywhere in the workspace. Mongoose's own naming is used (`Order` → `orders`, `Person` → `people`, `Category` → `categories`), as is a collection name passed to `model()` or set in the schema's `collection` option.
4. A variable assigned earlier in the same file: `const orders = db.collection("orders")`, `orders = db.orders`.
5. Python attribute access on a database object: `db.orders.find(…)`, where `db` is named like a database or comes from a client.

Calls that don't match any of these, like `array.find(x => …)`, are ignored.

### What isn't checked

The lens says why, so nothing is silently skipped:

- **Filters built at run time:** `find(filter)` where `filter` is a variable. Write the object in the call, or check it in mongosh.
- **`$or` queries:** checked, but no single index is suggested, because each branch needs its own.
- **`$expr`, `$where`, `$text`, `$jsonSchema`:** checked as they are, with no suggestion.
- Projections, collations and `hint()` are not taken into account.

## 6. Index Doctor

Open it with **MongoDB Lens: Open Index Doctor**, or the dashboard button in the sidebar. It compares the indexes in your database with the queries in your code:

- **Missing indexes:** the indexes your checked queries need, each with the queries that need it (click to jump to them), **Create**, and copy buttons.
- **Indexes nothing uses:** indexes MongoDB reports as used **0 times** (`$indexStats`) that no checked query uses either, and **duplicates**, where another index starts with the same fields and can do the job. Every index slows down writes and uses disk and memory.
- **All collections:** documents, size, and every index with its fields, size, use count, and which queries in your code use it.

Good to know:

- Use counts start from the **last server restart**, and on a replica set they're for the server you're connected to. An index used once a month can look unused. Check before dropping.
- `_id`, unique, TTL and partial indexes are never listed as unused, because they do more than speed up queries.
- On some hosted tiers (for example Atlas shared clusters), `$indexStats` or `$collStats` aren't allowed. Sizes or use counts then show as "–".

## 7. Schema drift

**MongoDB Lens: Check Schema Against Data** (or the button in Index Doctor) reads every Mongoose schema in your workspace that has a model, takes a random sample of its collection (1,000 documents by default, using `$sample`), and reports where the two disagree. Each finding appears in the **Problems** panel on the schema line it concerns:

| Finding | Example |
|---|---|
| **Wrong type** | *price should be a number, but it's a string in 12% of documents (120).* |
| **Required but missing** | *email is required, but 5% of documents (50) don't have it.* |
| **Not in the schema** | *phone is in 38% of documents but not in the schema, so Mongoose drops it when saving and hides it from your models.* |
| **Never present** | *discontinued isn't in any of the 1,000 documents checked. Is it new, or renamed?* |

What's understood: `new Schema({…})` and `new mongoose.Schema({…})`, plain types (`String`, `Number`, `Boolean`, `Date`, `Buffer`, `Schema.Types.ObjectId`, `Decimal128`, `Mixed`, `Map`), arrays (`[String]`, `[{ … }]`), nested objects, `{ type: …, required: … }`, and the `timestamps`, `collection` and `strict` options. Fields under `Mixed`, `Map` or `{}` are not checked inside. Arrays are checked as arrays, not item by item.

Schemas built by functions, discriminators and plugins that add fields aren't read.

## 8. Safety and privacy

- **What Query Lens runs on your database:** `explain("executionStats")` of a `find()` (which reads documents, like the query does), `findOne()` to sample a value, `listIndexes`, `$indexStats`, `$collStats`, `$sample`, and `estimatedDocumentCount`. Every explain is stopped after `veyraMongo.maxTimeMS` (3 seconds by default).
- **What it changes:** nothing, unless you click **Create** or **Drop** and confirm. Each confirmation shows the database's address, and says when it's not on your computer. Turn on `veyraMongo.readOnly` to make creating and dropping impossible; suggestions can still be copied as code.
- **Production:** Query Lens is meant for development databases. If you connect to production, use `veyraMongo.analyze: onClick` and `veyraMongo.readOnly: true`, and add indexes through your normal deployment.
- **Connection strings** are kept in VS Code's secret storage, never in settings, and passwords are hidden wherever a connection string is shown.
- **Nothing is sent anywhere else.** There's no account and no telemetry. Query Lens talks only to the database you connect it to.
- **Restricted Mode:** in an untrusted folder, connection strings in its `.env` files are not used.

## 9. Commands

| Command | |
|---|---|
| MongoDB Lens: Connect to MongoDB… | Connect, or switch database |
| MongoDB Lens: Disconnect | Disconnect and forget the connection string |
| MongoDB Lens: Check All Queries | Check every query in the workspace |
| MongoDB Lens: Open Index Doctor | Missing, unused and duplicate indexes |
| MongoDB Lens: Check Schema Against Data | Compare Mongoose schemas with documents |
| MongoDB Lens: Refresh | Read the code again and forget cached results |

The **MongoDB Query Lens** sidebar lists your queries by collection, with their status (click one to jump to it), and your database's collections and indexes.

## 10. Settings

| Setting | Default | |
|---|---|---|
| `veyraMongo.analyze` | `local` | `local`: check automatically on databases on your computer, on click elsewhere. `always` or `onClick`. |
| `veyraMongo.readOnly` | `false` | Never create or drop indexes from VS Code. |
| `veyraMongo.maxTimeMS` | `3000` | Stop any explain that takes longer than this. |
| `veyraMongo.sampleSize` | `1000` | Documents to sample when checking schemas. |
| `veyraMongo.problems` | `true` | List slow queries and schema drift in the Problems panel. |

## 11. Troubleshooting

**"Server selection timed out" when connecting.** Is the database running, and is the address right? For Atlas, add your IP address to the project's IP Access List. For Docker, check the port is published (`-p 27017:27017`).

**"Authentication failed".** Check the user name and password, and `?authSource=admin` if the user was created in the `admin` database.

**The lens says "Not checked: The filter is built at run time".** Query Lens reads filters written in the call. If you build them in a function, check them in mongosh, or write the object in the call.

**A query is matched to the wrong collection.** Add `// veyra-collection: <name>` on the line above it.

**No lens appears above a query.** The method may not be one Query Lens checks, or the collection couldn't be found (see [How the collection is found](#how-the-collection-is-found)). The sidebar lists every query it found.

**"Stopped after 3000 ms".** The query is very slow on this data, which is itself the answer. Raise `veyraMongo.maxTimeMS` to see the full plan.

**Sizes or use counts show "–".** Your server or plan doesn't allow `$collStats` or `$indexStats` (see [Index Doctor](#6-index-doctor)).

## 12. How it works

For the curious, and for anyone extending it:

1. **Reading code.** Query Lens doesn't run your code. It finds method calls like `.find(` in JavaScript, TypeScript and Python files, skipping comments and strings, and reads their arguments with a forgiving parser for object literals. Literal values are kept; anything computed becomes a placeholder that remembers its field. Chained `.sort()` and `.limit()` calls, options objects and Python keywords are read too.
2. **Placing the query.** The collection comes from the call, from Mongoose models defined anywhere in the workspace (with Mongoose's own pluralization), from variables, or from a comment.
3. **Asking MongoDB.** Placeholders are filled with real values sampled from the collection, and the query runs as `find(filter).sort(sort).limit(limit).explain("executionStats")` with a time limit. The winning plan is read for both of MongoDB's query engines (classic and slot-based).
4. **Advising.** The plan's stages and numbers become a level and a sentence. The suggested index follows the Equality, Sort, Range rule and is compared with the collection's existing indexes, so an index that's already there is never suggested again.
5. **Index Doctor** joins `listIndexes`, `$indexStats` and `$collStats` with the plans of the checked queries.
6. **Schema drift** reads Mongoose schema literals into typed paths, samples documents with `$sample`, flattens them to dotted paths, and compares their BSON types with the schema.

Query Lens is open source (MIT). Issues and ideas are welcome at [github.com/fcopensource/veyraeditor](https://github.com/fcopensource/veyraeditor/issues).

---

*MongoDB is a trademark of MongoDB, Inc. Veyra Query Lens is an independent extension and is not made or endorsed by MongoDB, Inc.*
