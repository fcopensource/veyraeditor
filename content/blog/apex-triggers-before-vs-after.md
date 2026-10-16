---
title: Apex triggers: before vs after, and bulk-safe patterns
description: When to use before and after triggers, how to write bulk-safe Apex within governor limits, and the handler pattern that keeps triggers tidy.
date: 2026-10-14
category: Guides
readingTime: 9
keywords: Apex trigger, before vs after trigger, Salesforce trigger best practices, bulkify Apex, trigger handler pattern, governor limits, Trigger.new, Trigger.oldMap
---

Apex triggers run your code when records are inserted, updated, deleted or undeleted. They're powerful, and they're also where many Salesforce orgs get into trouble: slow saves, "Too many SOQL queries" errors, and logic nobody can follow. This guide covers the choices that matter most.

## Before or after?

Every trigger event comes in two timings:

| | **before** | **after** |
|---|---|---|
| Runs | before the records are saved | after they're saved, but before the transaction commits |
| Record IDs | not yet set on insert | available |
| Change fields on the same records | yes, just assign them, no DML needed | no, the records are read-only |
| Typical use | set defaults, validate, normalise data | create or update **related** records, call out asynchronously |

The rule of thumb: **change the record itself in a before trigger; touch other records in an after trigger.**

Setting a field in a before trigger costs nothing extra:

```java
trigger AccountTrigger on Account (before insert, before update) {
    for (Account account : Trigger.new) {
        if (account.Rating == null) {
            account.Rating = 'Warm';
        }
    }
}
```

Doing the same in an after trigger would need a second `update`, which fires the triggers again and wastes limits.

## The context variables you'll use most

| Variable | What it holds |
|---|---|
| `Trigger.new` | The new versions of the records (insert, update, undelete) |
| `Trigger.old` | The old versions (update, delete) |
| `Trigger.newMap`, `Trigger.oldMap` | The same records keyed by ID |
| `Trigger.isInsert`, `isUpdate`, `isDelete`, `isUndelete` | Which operation is running |
| `Trigger.isBefore`, `Trigger.isAfter` | Which timing is running |

To react only when a field actually changes, compare with the old value:

```java
for (Opportunity opp : Trigger.new) {
    Opportunity before = Trigger.oldMap.get(opp.Id);
    if (opp.StageName != before.StageName && opp.StageName == 'Closed Won') {
        // the stage just became Closed Won
    }
}
```

## Always write for 200 records

A trigger doesn't receive one record. It receives up to 200 at a time, from a data load, an integration or a mass update. Code that works for one record and fails for 200 is the most common Apex bug.

Salesforce enforces **governor limits** per transaction, including:

- 100 SOQL queries (synchronous)
- 150 DML statements
- 10,000 records processed by DML

So the golden rule is: **no SOQL or DML inside a loop.** Collect what you need, query once, and save once.

This version runs one query per record and breaks on a bulk load:

```java
// Don't do this
for (Contact contact : Trigger.new) {
    Account account = [SELECT Id, Industry FROM Account WHERE Id = :contact.AccountId];
    contact.Description = account.Industry;
}
```

This version runs one query in total, whatever the batch size:

```java
Set<Id> accountIds = new Set<Id>();
for (Contact contact : Trigger.new) {
    if (contact.AccountId != null) accountIds.add(contact.AccountId);
}
Map<Id, Account> accounts = new Map<Id, Account>(
    [SELECT Id, Industry FROM Account WHERE Id IN :accountIds]
);
for (Contact contact : Trigger.new) {
    Account account = accounts.get(contact.AccountId);
    if (account != null) contact.Description = account.Industry;
}
```

## One trigger per object

If an object has several triggers, Salesforce doesn't guarantee the order they run in. The widely used fix is **one trigger per object** that hands everything to a handler class:

```java
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    OpportunityTriggerHandler handler = new OpportunityTriggerHandler();
    if (Trigger.isBefore) {
        if (Trigger.isInsert) handler.beforeInsert(Trigger.new);
        if (Trigger.isUpdate) handler.beforeUpdate(Trigger.new, Trigger.oldMap);
    } else {
        if (Trigger.isInsert) handler.afterInsert(Trigger.new);
        if (Trigger.isUpdate) handler.afterUpdate(Trigger.new, Trigger.oldMap);
    }
}
```

```java
public with sharing class OpportunityTriggerHandler {
    public void beforeInsert(List<Opportunity> records) { /* defaults, validation */ }
    public void beforeUpdate(List<Opportunity> records, Map<Id, Opportunity> oldMap) { }
    public void afterInsert(List<Opportunity> records) { /* related records */ }
    public void afterUpdate(List<Opportunity> records, Map<Id, Opportunity> oldMap) { }
}
```

The trigger stays a few lines long, the logic lives in a class you can test and reuse, and the order is under your control.

## Avoid recursion

An after trigger that updates the same object fires the trigger again. Guard against loops with a static flag, which lives for the whole transaction:

```java
public class TriggerGuard {
    public static Boolean opportunityRunning = false;
}
```

```java
if (!TriggerGuard.opportunityRunning) {
    TriggerGuard.opportunityRunning = true;
    // work that may update opportunities again
    TriggerGuard.opportunityRunning = false;
}
```

Better still, design so the trigger doesn't need to update its own object after save: that work usually belongs in the before trigger.

## Test it before production

To deploy Apex to production, Salesforce requires **at least 75% code coverage** across your Apex, and **every trigger needs some coverage**. Write tests that insert and update records in bulk, and assert the results:

```java
@IsTest
private class AccountTriggerTest {
    @IsTest
    static void setsDefaultRatingForEveryRecord() {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) accounts.add(new Account(Name = 'Test ' + i));
        Test.startTest();
        insert accounts;
        Test.stopTest();
        for (Account account : [SELECT Rating FROM Account WHERE Id IN :accounts]) {
            System.assertEquals('Warm', account.Rating);
        }
    }
}
```

Testing 200 records proves the trigger is bulk-safe, not only that it works once.

## Create a trigger in seconds

In [Salesforce Studio](/salesforce-studio), choose **New → Apex Trigger**, pick the object and the events, and click **Deploy**. Studio creates the trigger with the right signature and saves it to your org. Edit the handler class next to it and save each change with <kbd>Ctrl</kbd>+<kbd>S</kbd>.

## Checklist

- Change the record itself in **before**; touch other records in **after**.
- Never put SOQL or DML inside a loop.
- One trigger per object, with the logic in a handler class.
- Guard against recursion.
- Test with 200 records and assert the results.
