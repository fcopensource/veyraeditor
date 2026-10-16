---
title: Create your first Lightning Web Component in 10 minutes
description: A beginner's guide to Lightning Web Components: the three files every LWC needs, reactive properties, events, calling Apex, and putting it on a Lightning page.
date: 2026-10-15
category: Guides
readingTime: 8
keywords: Lightning Web Component tutorial, create LWC, LWC for beginners, js-meta.xml, LWC targets, @api, @wire Apex, Salesforce LWC
---

Lightning Web Components (LWC) are how you build modern UI on Salesforce. They're standard web components with a little Salesforce on top, so if you know HTML and JavaScript you're most of the way there. In this guide you'll build a small component, make it interactive, load data from Apex, and put it on a page.

## What you need

- A Salesforce org you can change. A free [Developer Edition org](https://developer.salesforce.com/signup) is perfect for learning.
- A way to create and save components. You can use the Salesforce CLI with VS Code, or [Salesforce Studio](/salesforce-studio) in your browser, which needs no setup.

## The three files of every LWC

A component is a folder named after it, in camelCase, holding at least three files. For a component called `helloCard`:

| File | What it holds |
|---|---|
| `helloCard.html` | The template: what the component shows |
| `helloCard.js` | The JavaScript class: data and behaviour |
| `helloCard.js-meta.xml` | Settings: API version, and where the component can be used |

You can add a `helloCard.css` for styles, which apply to this component only, and an SVG icon.

The name must start with a lowercase letter and use only letters and numbers. In markup it's written in kebab-case: `helloCard` becomes `<c-hello-card>`.

## Step 1: create the component

**With Salesforce Studio:** open any Salesforce tab, click the Studio icon, choose **New → Lightning Web Component**, name it `helloCard`, tick **isExposed**, pick the targets **lightning__AppPage**, **lightning__RecordPage** and **lightning__HomePage**, and click **Deploy**. The three files are created and saved to your org.

**With the Salesforce CLI:**

```
sf lightning generate component --name helloCard --type lwc --output-dir force-app/main/default/lwc
```

## Step 2: write the template

Replace the HTML with:

```html
<template>
    <lightning-card title="Hello" icon-name="custom:custom14">
        <div class="slds-p-horizontal_medium">
            <p>Hello, {greeting}!</p>
            <lightning-input label="Your name" value={greeting} onchange={handleChange}></lightning-input>
        </div>
    </lightning-card>
</template>
```

`{greeting}` displays a property from the JavaScript class. `lightning-card` and `lightning-input` are base components that come with Salesforce, styled with the Lightning Design System.

## Step 3: add behaviour

```js
import { LightningElement } from 'lwc';

export default class HelloCard extends LightningElement {
    greeting = 'World';

    handleChange(event) {
        this.greeting = event.target.value;
    }
}
```

Fields on the class are reactive: when `greeting` changes, the template updates. Type in the input and the text changes as you type.

## Step 4: let a page admin configure it

Make `greeting` a public property with `@api`, so it can be set from outside:

```js
import { LightningElement, api } from 'lwc';

export default class HelloCard extends LightningElement {
    @api greeting = 'World';
}
```

To let admins set it in Lightning App Builder, declare it in `helloCard.js-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>lightning__AppPage</target>
        <target>lightning__RecordPage</target>
        <target>lightning__HomePage</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="lightning__AppPage,lightning__RecordPage,lightning__HomePage">
            <property name="greeting" type="String" default="World" label="Greeting"/>
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

Without `isExposed` set to `true`, the component can't be dragged onto pages at all, and `targets` decides which kinds of page it appears for.

## Step 5: load data from Apex

Components read Salesforce data through Apex methods marked `@AuraEnabled`. Create an Apex class:

```java
public with sharing class AccountController {
    @AuraEnabled(cacheable=true)
    public static List<Account> getRecentAccounts() {
        return [SELECT Id, Name, Industry FROM Account WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 5];
    }
}
```

Then wire it into your component:

```js
import { LightningElement, wire } from 'lwc';
import getRecentAccounts from '@salesforce/apex/AccountController.getRecentAccounts';

export default class HelloCard extends LightningElement {
    @wire(getRecentAccounts) accounts;
}
```

```html
<template>
    <lightning-card title="Recent accounts">
        <template lwc:if={accounts.data}>
            <template for:each={accounts.data} for:item="account">
                <p key={account.Id} class="slds-p-horizontal_medium">{account.Name}</p>
            </template>
        </template>
        <template lwc:if={accounts.error}>
            <p class="slds-p-horizontal_medium">Couldn't load accounts.</p>
        </template>
    </lightning-card>
</template>
```

`cacheable=true` is required for `@wire`, and `WITH USER_MODE` makes the query respect the current user's access. Every item in a `for:each` loop needs a unique `key`.

## Step 6: put it on a page

1. In Salesforce, open **Setup → Lightning App Builder**, or edit any record page with **Edit Page** from the gear menu.
2. Find **helloCard** under **Custom** in the component list.
3. Drag it onto the page, set **Greeting** in the properties panel, and click **Save**, then **Activate** if asked.

## Saving changes as you go

With Salesforce Studio, press <kbd>Ctrl</kbd>+<kbd>S</kbd> after each change and refresh the Salesforce page to see it. With the CLI, deploy with:

```
sf project deploy start --source-dir force-app/main/default/lwc/helloCard
```

If something's wrong, for example a typo in the template, Salesforce rejects the save and tells you the file and line.

## Where to go next

- Split your UI into small components and pass data down with `@api` properties.
- Send messages up with custom events: `this.dispatchEvent(new CustomEvent('select', { detail: id }))`.
- Share data between unrelated components with a Lightning Message Channel.

When you're ready to edit the components already in your org, [Salesforce Studio](/salesforce-studio) opens them all in seconds.
