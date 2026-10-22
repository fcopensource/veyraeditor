---
title: How to find slow MongoDB queries before they reach production
description: Read explain() like a pro, spot collection scans and in-memory sorts, build the right compound index with the Equality, Sort, Range rule, and find indexes nothing uses.
date: 2026-10-22
category: Guides
readingTime: 9
keywords: slow MongoDB query, MongoDB explain, COLLSCAN, MongoDB index, compound index, ESR rule, MongoDB performance, Mongoose index, unused indexes, indexStats
---

Most slow MongoDB queries are fast on a laptop. With a few hundred documents, a query that reads the whole collection still returns in a millisecond. Then the collection grows to a few million documents in production, and the same query takes seconds and eats the server's CPU.

The good news: you can see this coming long before it happens. This guide shows how.

## Ask MongoDB how it runs the query

Every query can be explained. In mongosh:

```js
db.orders.find({ customerId: "c_8812", createdAt: { $gte: ISODate("2026-01-01") } })
  .sort({ createdAt: -1 })
  .limit(20)
  .explain("executionStats")
```

Three numbers in `executionStats` tell you most of what you need:

| Field | Meaning |
|---|---|
| `totalDocsExamined` | How many documents MongoDB read |
| `totalKeysExamined` | How many index entries it read |
| `nReturned` | How many documents it sent back |

**A healthy query reads about as many documents as it returns.** If it reads 48,210 documents to return 20, something is wrong, and it'll only get worse as the collection grows.

## The two stages to look for

The `winningPlan` is a tree of stages. Two are red flags:

- **`COLLSCAN`:** a full collection scan. No index helped, so MongoDB read every document. On MongoDB's newer query engine the plan may be nested under `queryPlan`, but the stage names are the same.
- **`SORT`:** an in-memory sort. An index found the documents, but not in the order you asked for, so MongoDB sorted them in memory. Large sorts are slow, spill to disk, and fail if disk use isn't allowed.

What you want to see is `IXSCAN` (an index scan) feeding `FETCH`, with no `SORT` stage.

## Build the right index: Equality, Sort, Range

A compound index helps only when its fields are in the right order. MongoDB's own guidance is the **ESR rule**:

1. **Equality** fields first: those matched exactly (`status: "paid"`, `$in`).
2. **Sort** fields next, in the direction you sort.
3. **Range** fields last: `$gt`, `$gte`, `$lt`, `$lte`, and prefix regexes.

For the query above:

```js
// equality: customerId · sort: createdAt (descending) · range: createdAt (already in the index)
db.orders.createIndex({ customerId: 1, createdAt: -1 })
```

Run `explain` again. The plan becomes `IXSCAN → FETCH` with no `SORT`, and `totalDocsExamined` drops from 48,210 to 20.

Why the order matters: an index on `{ createdAt: -1, customerId: 1 }` would have to walk through every customer's orders in date order to find this customer's. Equality first narrows the index to one customer; then the dates are already sorted.

Two more tips:

- An index can be read **in both directions**, so `{ a: 1, b: -1 }` also serves a sort on `{ a: -1, b: 1 }`.
- An index on `{ a: 1, b: 1 }` also serves queries on `a` alone. That makes a separate `{ a: 1 }` index a **duplicate**.

## Indexes that cost you and help nobody

Every index slows down every insert and update, and takes disk and memory. Over the years, indexes pile up that no query uses any more. Ask MongoDB:

```js
db.orders.aggregate([{ $indexStats: {} }])
```

`accesses.ops` is how many times each index was used **since the server last started** (and on a replica set, for the member you're connected to). An index at 0 after weeks of normal traffic is a candidate to drop. Be careful with indexes for monthly jobs, and never drop `_id`, unique or TTL indexes just because they look unused: they do more than speed up queries.

## Doing all this without leaving your editor

Running `explain` by hand works, but only for the queries you remember to check. We built **[Veyra Query Lens for MongoDB](/mongodb)**, a free VS Code extension, to do it for every query in your code:

- It finds the MongoDB queries in your Node.js, Mongoose and Python code and runs `explain("executionStats")` for each one on your development database.
- It shows the result **above the query**, like `⚠ Full collection scan · 48,210 read → 20 returned`.
- It suggests the index using the ESR rule, creates it in one click, and gives you the line to add to your Mongoose schema or migration.
- Values that only exist at run time (like `req.params.id`) are filled with real values from the collection, so the plan matches what your app gets.
- **Index Doctor** lists missing, unused and duplicate indexes, and it can compare your Mongoose schemas with real documents.

The [user guide](/mongodb/docs) explains how it works in detail.

## A checklist before you ship

- Every frequent query has an `IXSCAN`, not a `COLLSCAN`.
- No `SORT` stage on queries that sort and limit, like "latest 20 orders".
- `totalDocsExamined` is close to `nReturned`.
- New indexes are in your code (`schema.index(...)` or a migration), not just in your dev database.
- Unused and duplicate indexes are gone.

Test with realistic data if you can. A copy of production with personal data removed shows the plans your users will really get.
