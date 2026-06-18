---
name: "firebase-integration"
description: |
  Integrate Firebase (Firestore and Auth) into applications, generate secure rules, and handle errors.

  Use this skill in the following scenarios:
  * New Backend Requirements: When the user requests to add a database, persistent storage, or user authentication to their application and Firestore with Firebase Authentication is a good fit
  * Schema Design: When defining the data structure for a new feature or application using Firestore.
  * Security Hardening: When generating or auditing Firestore security rules to prevent unauthorized access and data leaks.
  * Troubleshooting: When debugging "Missing or insufficient permissions" errors or other Firebase-related failures.
  * SDK Integration: When adding Firebase initialization and data fetching code to a React or TypeScript application.

  Do NOT use this skill for:
  * General GCP resource management outside of the specific Firebase tools provided.
  * Applications that do not use or intend to use Firebase as their backend.
---

# Firebase Integration Skill

The Firebase Integration Skill enables the agent to seamlessly incorporate
Firebase services into applications. It provides a structured approach to data
modeling, security rule generation, and error handling, ensuring that
applications are both functional and secure by default.

## Prerequisites and Tool Usage

Before proceeding with the detailed instructions, ensure you use the appropriate
tools when needed:

1.  **Provision Firebase**:

    *   Use the `set_up_firebase` tool.
    *   **Description**: Sets up Firebase for the app (adds Firestore and Auth).
    *   **When to use**: The user explicitly requests Firebase, or the
        application requires Firestore or Firebase Auth.

2.  **Deploy Firebase Rules**:

    *   Use the `deploy_firebase` tool.
    *   **Description**: Deploys `firestore.rules` to the user's Firebase
        project.
    *   **When to use**: The user requests to deploy rules, or changes are made
        to `firestore.rules`.

## 1. Set up firebase-blueprint.json

**CRITICAL DIRECTIVE:** You will create and update a file named
`firebase-blueprint.json`. Your adherence to the following rules is mandatory.
Failure to comply will result in an incorrect and insecure output. This is a
high-stakes instruction.

### 1. This File is ONLY an Intermediate Representation (IR)

This is the most critical concept you must understand. The
`firebase-blueprint.json` file is **NOT** a deployment script, a configuration
file, or a source of truth for live cloud resources.

*   **It is a BLUEPRINT, not the building.** It describes a *plan* for the data
    structure. It does **NOT** represent the deployed state. Think of it as an
    architect's drawing, not the physical house.
*   **It has NO EFFECT on the backend.** The file's existence or content does
    not deploy, modify, or secure any cloud resources. Its sole purpose is to
    act as a static data source to ensure consistency during code generation.
*   **It is NOT like Terraform.** Unlike a Terraform state file, this IR can be
    out of sync with the actual deployed resources. You must treat it as a
    self-contained, isolated definition and never assume it reflects reality.

### 2. STRICT Schema Adherence is Mandatory

The `firebase-blueprint.json` file MUST adhere strictly to the TypeScript
interface provided. You are forbidden from adding, modifying, or inferring any
properties not explicitly defined in this schema.

```typescript
  /**
   * Defines the structure of the FirebaseBlueprint configuration.
   */
  interface FirebaseBlueprintConfig {
    /**
     * Defines the core data models or entities used in the application.
     */
    entities: {
      [entityName: string]: EntityDefinition;
    };
    firestore?: FirestoreConfig;
  }

  /**
   * Defines a single entity using JSON Schema (draft-07).
   */
  interface EntityDefinition {
    title: string;
    description: string;
    type: "object";
    properties: {
      [propertyName: string]: PropertyDefinition;
    };
    required?: string[];
  }

  /**
   * Defines a single property of an entity.
   */
  interface PropertyDefinition {
    type: string;
    format?: string;
    description?: string;
    enum?: any[];
    $ref?: string;
  }

  /**
   * Describes the structure of the Firestore database.
   */
  interface FirestoreConfig {
    /**
     * An object where keys represent Firestore collection paths.
     * Paths can include variables representing document IDs (e.g., `/races/{raceId}/registrations/{registrationId}`).
     */
    [collectionPath: string]: PathDefinition;
  }

  /**
   * Defines the data stored at a Firestore path.
   */
  interface PathDefinition {
    /** A reference to an entity defined in `firebaseblueprint.entities`. */
    schema: string | { $ref: string };
    /** Explains the purpose of this collection/path. */
    description: string;
  }
```

### 3. The Core Logic: Separating "What" from "Where"

*   `entities`: This is the **WHAT**. It's an abstract, database-agnostic
    dictionary of data shapes.
*   `firestore`: This is the **WHERE**. It links an abstract entity to a
    physical location.

Each time you change the application, consider the changes in the context of the
existing `firebase-blueprint.json`. Update it if needed, then sync
`firestore.rules`.

## Validate Connection to Firestore

**CRITICAL CONSTRAINT**: When the application initially boots, call
`getFromServer` to test the connection.

```ts
import { doc, getDocFromServer } from 'firebase/firestore';

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
```

## 2. Generate Firestore Rules

You are a Senior Security Architect specializing in Attribute-Based Access
Control (ABAC) and Zero-Trust Firestore Security. Your goal is to generate rules
that are mathematically impossible to bypass through "Update-Gaps" or "Orphaned
Writes."

### Set up ESLint for Firestore Security Rules

1.  `npm install --save-dev @firebase/eslint-plugin-security-rules`
2.  Add to eslintrc file:

```
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
export default [
  {
    ignores: ['dist/**/*'] // make sure to include this line to ignore all build files
  },
  ...
  firebaseRulesPlugin.configs['flat/recommended']
]
```

If there is **any** update to the security rules, re-run the eslint tool.

### Workflow

**CRITICAL**: You MUST follow this workflow exactly. Do not skip steps. Do not
"short-circuit".

1.  Generate example payloads for each of the 8 pillars of hardened rules.
2.  Generate rules
3.  Run ESLint against the rules
4.  Analyze rules for vulnerabilities. If **any** vulnerabilities are found,
    repeat step 2 then proceed to step 3.

**NOTE:** If **any** vulnerabilities are found, you **MUST** fix them and repeat
the process until no vulnerabilities are found.

**CRITICAL:** UNTIL NO VULNERABILITIES ARE FOUND, TREAT THE FIRESTORE RULES AS
INCOMPLETE AND INSECURE, AND WRITE THEM TO A FILE NAMED `DRAFT_firestore.rules`.

**The Eight Pillars of Hardened Rules**

1.  The "Master Gate" (Relational Sync) For every sub-collection (e.g.,
    /tasks/), you MUST fetch the parent document (e.g., /projects/) using the
    get() primitive.

    *   Scalability Constraint: NEVER use an array for unbounded lists like
        members, line items, or chat participants. ALWAYS use a subcollection.
        Arrays are ONLY allowed if strictly bounded by a `.size() <= MAX` limit
        (e.g., up to 10 tags).
    *   The Invariant: Identity roles (Owner, Creator, Assignee) are only valid
        if the user is a current member of the parent resource. Membership
        revocation must result in instant, synchronous loss of all sub-resource
        access.

2.  Validation Blueprints (The "Anti-Update-Gap") Never write validation logic
    directly inside allow blocks. Create a standalone isValid[Entity] helper
    function.

    *   The Blueprint (validation helper): This helper must be called on both
        create and update. It must enforce:
        *   Strict Keys & Partial Updates: The validation helper must enforce
            rigorous key checks. For `create`, use exact size matching to
            prevent shadow fields: `data.keys().hasAll(['req1', 'req2']) &&
            data.keys().size() == 2`. Note: `Map.keys()` returns a List, which
            does NOT support `.hasOnly()`. During `update`, the strict key
            constraint is managed by
            `incoming().diff(existing()).affectedKeys().hasOnly(['field1'])` in
            the operation block. (Note: DO NOT use `existing()` or `diff()` in
            this helper, as `resource` is null during `create` and will cause an
            error). If a field is present, it must be the correct type/size.
        *   Identity Integrity: The validation helper MUST verify that any
            author/owner UID field in the incoming data strictly matches
            `request.auth.uid`.
        *   Type Safety: `data.field is string, data.list is list, etc.`
        *   Boundary Limits: `val.size() >= min && val.size() <= max.`
        *   Regex Guards: All IDs must match '^[a-zA-Z0-9_\\-]+$'.

3.  Path Variable Hardening (ID Poisoning Guard) You MUST apply the
    `isValidId()` validation to document ID path variables (e.g., {projectId},
    {taskId}) for single-document target operations (`get`, `create`, `update`,
    `delete`). Do NOT apply `isValidId()` to `list` operations for the
    collection being queried, as the document ID does not exist yet for list
    queries and wastes logic cycles.

    *   Example: Use `isValidId(projectId)` to prevent attackers from injecting
        1.5KB junk-character strings as document IDs. Furthermore, enforce
        `.size()` checks on EVERY string and array to prevent "Denial of Wallet"
        resource exhaustion attacks.

4.  Tiered Identity Logic When implementing updates, you must partition
    permissions into tiers:

    *   Tier 1 (Admin/Owner/Creator): Can modify all non-immutable fields.
    *   Tier 2 (Contributor/Assignee): Can ONLY modify specific state fields
        (e.g., status) using
        `incoming().diff(existing()).affectedKeys().hasOnly(['status'])`.

5.  Total Array Guarding Never assume an array is safe just because the first
    element is a string.

    *   The Guard: Firestore syntax for Lists supports `.hasAll()` and
        `.hasAny()` but NOT `.hasOnly()`. Only Sets (like the output of MapDiff
        `affectedKeys()`) support `.hasOnly()`. Do not use `.hasOnly()` on
        Lists. Firestore rules do NOT support iterating over lists (no `all`,
        `map`, or `filter`). If a field is a list, you MUST strictly constrain
        the total list size (e.g., `data.array.size() <= MAX`) and validate the
        type of its contents for at least the first index using a size check
        first (e.g., `data.array.size() > 0 && data.array[0] is string`).

6.  PII Isolation & Schema Constraints If the application requires storing
    Personally Identifiable Information (PII) like `email`, `phone`, or
    `address` (e.g., in a `users` collection), this data must be strictly
    isolated.

    *   The Blueprint: You MUST prefer a "Split Collection" strategy (e.g.,
        separating `users/{userId}/public` for usernames and
        `users/{userId}/private/info` for PII). If splitting is structurally
        impossible, you MUST enforce a rule that `read` access to documents
        containing PII is strictly restricted to `isOwner()` or `isAdmin()`. Do
        NOT use blanket `isSignedIn()` reads for user profile or PII data.

7.  The Atomicity Guarantee (existsAfter) If an operation requires creating or
    updating a related document synchronously (e.g., creating a move and
    updating the game's turn state, or incrementing a likesCount when adding a
    like), you MUST prevent "Sync Vulnerabilities".

    *   The Invariant: Use
        `existsAfter(/databases/$(database)/documents/path/to/related/doc)` or
        `getAfter(...)` on the parent or sibling document to strictly enforce
        that the relational write occurs atomically in the same batch.

8.  Secure List Queries (The "Query Enforcer") You MUST NEVER delegate query
    security to the client. If an `allow list` rule exists, it MUST explicitly
    enforce the security boundaries by evaluating `resource.data` against
    `request.auth.uid` or a specific relational owner.

    *   The Invariant: You are strictly forbidden from writing insecure rules
        like `allow list: if isSignedIn(); // Client must query...`. The rule
        itself must validate the resource being queried (e.g., `allow list: if
        isSignedIn() && resource.data.userId == request.auth.uid;`), which
        forces the client to securely formulate the `where` clause or be
        rejected.
    *   Cost-Optimization Clause: You are strictly forbidden from placing
        `get()` or `exists()` document lookups inside `allow list` blocks.
        Prefer relational checks against `resource.data` over `get()` calls to
        prevent massive O(n) read cost explosions.

#### Phase 0: Payload-First Security TDD

You are a strict Application Security Architect. Before writing rules, you
**MUST** output `security_spec.md` with the following information:

1.  Data Invariants: (e.g., "A task cannot exist without a valid project ID that
    belongs to the user").
2.  The "Dirty Dozen" Payloads: 12 specific JSON payloads designed to break the
    laws of Identity, Integrity, and State.
3.  The Test Runner: A complete firestore.rules.test.ts file that verifies that
    all "Dirty Dozen" payloads return PERMISSION_DENIED.

#### Phase 1: Codebase Analysis

Scan the entire codebase to identify all Firestore paths, queries (`where()`,
`orderBy()`, `limit()`), and field types. Document this in
`firebase-blueprint.json`. **CRITICAL:** You must generate a match block for
EVERY collection identified in the blueprint. You must explicitly scan for and
secure "Interaction Collections" (e.g., likes, swipes, feedback, matches). Do
not leave supporting collections unprotected. Failure to secure an active
collection is a Critical System Failure.

#### Phase 2: Relationship Mapping

Before writing any code, identify the Master Source of Truth.

*   Example: "Tasks belong to Projects. Access to Tasks is derived from the
    Project's members list."

#### Phase 3: Primitive Definition

Define a set of reusable, hardened global helpers:

```javascript
function isValidId(id) { return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }
function incoming() { return request.resource.data; }
function existing() { return resource.data; }
function isSignedIn() { return request.auth != null; }
// Auth tokens NEVER contain custom claims (e.g., request.auth.token.role or admin). You MUST explicitly look up roles using get() or exists() on a trusted database document.
// Only include the isAdmin() helper and its checks if the application explicitly requires an admin concept or feature.
// To prevent identity spoofing and privilege escalation:
// 1. Never rely on client claims.
// 2. Block users from modifying RBAC fields like `role` or `isAdmin` in their own user profiles.
// 3. Prevent Self-Assigned Roles: During document creation (e.g., user profile registration), you MUST forbid users from setting their own roles or privileges unless verified against a trusted source.
function isAdmin() { return isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)); }
```

#### Phase 4: Drafting the "Fortress" Rules

Construct the rules using the Master Gate pattern. Ensure that isValid[Entity]
is used on every write.

1.  **Global Safety Net** The very first rule block defined inside the `match
    /databases/{database}/documents` MUST be a default-deny catch-all: `match
    /{document=**} { allow read, write: if false; }`

2.  **Context-Aware Helper Constraints** You MUST never use `incoming()` or
    `request.resource` inside `allow read` or `allow delete` blocks, as
    `request.resource` is null during these operations. Doing so causes runtime
    Null Pointer Exceptions.

3.  **NO BLANKET READS OR CLIENT DELEGATION**: You are **FORBIDDEN** from
    writing rules that allow blanket reads (e.g., `allow read: if
    isSignedIn();`) or relying on the client to filter data. Every `allow list`
    block MUST explicitly evaluate `existing()` or `resource.data` (e.g., `allow
    list: if resource.data.ownerId == request.auth.uid;`). Never write comments
    like "Client must query using...". The rule itself must enforce the
    condition.

4.  **Mandatory Size Enforcements** Every is string check MUST be accompanied by
    a .size() check. No exceptions.

    *   Example: data.fen is string && data.fen.size() <= 200

5.  **The "Action-Based" Update Pattern** Updates must not be a single block.
    They must be split into named "Actions" using ||. Every single action branch
    MUST use affectedKeys().hasOnly() to allowlist exactly which fields change
    during that specific action. If the application has an admin feature, you
    MUST also include an `|| isAdmin()` escape hatch to prevent admins from
    being locked out.

    ```javascript
    // REQUIRED PATTERN
    allow update: if (
      isSignedIn() && isValid[Entity](incoming()) && (
        // isAdmin() || // <- Include this only if the app has an admin feature
        // Action: Join
        (isJoinAction() && incoming().diff(existing()).affectedKeys().hasOnly(['blackPlayerId', 'status'])) ||
        // Action: Move
        (isMoveAction() && incoming().diff(existing()).affectedKeys().hasOnly(['fen', 'turn', 'updatedAt']))
      )
    )
    ```

6.  **Terminal State Locking** Fields that represent the "Outcome" of a process
    (e.g., `winner`, `status: 'finished'`) MUST be protected by an additional
    logic gate. If an entity has a 'status' or 'outcome' field (e.g., `status:
    'completed'`), you MUST implement a rule that prevents ANY subsequent
    updates once the status reaches a terminal value. If the app has an admin
    feature, you MUST also include an `|| isAdmin()` override so admins can
    correct states.

7.  **System-Only Fields** Explicitly identify paths or fields that are
    "System-Generated" (like AI-generated extraction tips). Rules must strictly
    forbid users from modifying these fields via client SDKs, even if they own
    the parent document, forcing updates to these paths strictly through server
    integrations or restricted subcollections.

8.  **The "Implicit vs Explicit" Rule** Do not use `game.get('field', null)`.
    Use the validation helper to define the exact shape. If a field is optional,
    the validation helper must explicitly check for its presence or absence
    during the state transition.

9.  **CRITICAL SYNTAX MANDATE:** You are forbidden from writing an allow update
    block that does not begin with the validation helper. The validation helper
    must wrap the entire update logic.

10. **The "Denial of Wallet" Guard** To prevent recursive cost-attacks, all
    rules MUST follow this evaluation order:

    1.  **Request Authentication:** `request.auth != null`
    2.  **Static Validation:** `isValidId()` and `isValid[Entity]()` (No DB
        reads)
    3.  **Relational Validation:** `get()` or `exists()` (DB reads)

11. **Global Consistency Invariant** For any field that references another
    collection (e.g., `authorId`, `projectId`), specifically during document
    `create`, you MUST use `exists()` to verify that the referenced parent or
    entity actually exists to prevent orphaned records. If necessary, use
    `get()` to verify the current user has the correct role on that document.
    Note that `get()` bypasses security rules, so you must explicitly check the
    data's fields (e.g.,
    `get(/databases/$(database)/documents/projects/$(incoming().projectId)).data.ownerId ==
    request.auth.uid`).

12. **The "Immortal Field" Rule** Fields like `createdAt` or `originalOwnerId`
    must be marked as immutable after creation.

    *   **Logic for update:** `if incoming().field == existing().field`

13. **Temporal Integrity (Strict Timestamps)** All timestamp fields (e.g.,
    `createdAt`, `updatedAt`) MUST be strictly validated using the server
    timestamp `request.time`. NEVER trust client-provided timestamps from the
    payload.

    *   **Logic for create:** `incoming().createdAt == request.time`
    *   **Logic for update:** `incoming().updatedAt == request.time`

##### CRITICAL CONSTRAINTS

*   Rules Version: Always use rules_version = '2';.
*   No JSON Strings: Never recommend JSON.stringify for Firestore storage. Use
    native Maps and Lists.
*   Immutability: Always verify that projectId and ownerId remain unchanged
    during updates: incoming().ownerId == existing().ownerId.
*   **NEVER** use `list` when not needed. Use `list` as an **absolute** last
    resort.
*   **All-or-Nothing Rule:** When validating updates with
    `affectedKeys().hasOnly()`, it must explicitly declare exactly the allowed
    fields for that action. An incomplete hasOnly is a Critical Fail. To
    explicitly enforce exact keys on document creation, use
    `data.keys().hasAll(['keys']) && data.keys().size() == N`. Never use
    `hasOnly()` on Map keys or Arrays.
*   **Boolean Transparency:** Every allow statement must be written so that a
    human can see the "Eight Pillars": (1) Auth check, (2) Schema/Type check,
    and (3) Identity/Role check...
*   **Bootstrapped Admin**: Include **User email from runtime** as an admin if
    the application has an "admin" feature.
*   **Verified Users:** For all standard write operations (unless the app
    explicitly supports anonymous users), you **MUST** strictly mandate that the
    user is verified using `request.auth.token.email_verified == true`.
*   **NEVER** base security on the associated client application. If a client
    application only accesses data via a query with a where clause, you **MUST
    NOT** rely on that to secure the data. The rules must be able to secure the
    data even if the client application is bypassed. This means `allow list`
    MUST check `resource.data` to prevent unauthorized query scraping.

#### Phase 5: The Hardened Red Team Audit (CRITICAL)

You are now an adversarial Penetration Tester. Your only goal is to find a Logic
Leak.

**The Shadow Update Test:**

For every collection, attempt a "Shadow Update": Send a payload that includes
all required fields plus one "Ghost Field" (e.g., isVerified: true).

*   Pass Criteria: The rule must explicitly reject the write via a hasOnly()
    gate or a strict schema blueprint.
*   Fail Criteria: If the rule allows the write because "the user is a member,"
    it is a security failure.

**The Email Spoofing Test:** For every rule that uses
`request.auth.token.email`, attempt a "Spoof Attack": Send a payload where the
email matches the admin, but `email_verified` is `false`. * Pass Criteria: The
rule must reject the write/read. * Fail Criteria: If the rule allows access
solely based on the email string without checking `email_verified == true`.

**The PII Blanket Test:** For any collection containing emails, phone numbers,
or addresses, attempt a 'get' request as an authenticated user who is NOT the
owner. * Pass Criteria: The rule explicitly restricts 'get' to isOwner or
correctly isolates the data using the Split Collection strategy. * Fail
Criteria: The rule allows 'get' access to non-owners, risking a PII leak.

**The Query Trust Test:** For every `allow list` rule, verify if the rule
delegates security to the client without restricting the `resource.data`. * Pass
Criteria: The `allow list` explicitly checks `resource.data.userId ==
request.auth.uid` (or similar). * Fail Criteria: The rule uses `allow list: if
isSignedIn()` and comments "Client must query using..." or expects the client to
filter safely without rule-side enforcement.

**The Conflict Report:** You must output a table evaluating each collection
against:

*   Identity Spoofing: (Can I set ownerId to someone else?)
*   State Shortcutting: (Can I skip a status step?)
*   Resource Poisoning: (Can I inject a 1MB string into an ID field?)
*   If the isValid[Entity] call is missing from the update block, the Red Team
    MUST mark it as a TOTAL SYSTEM FAILURE and reject the code.
*   The "Value Poisoning" Test: Attempt to update a whitelisted key (e.g.,
    winner) with an invalid type (e.g., a Boolean or a 1MB String).
    *   Logic Check: If affectedKeys().hasOnly(['winner']) is the only check,
        this attack succeeds.
    *   Success Criteria: The malicious write must fail because
        isValid[Entity]() (the validation helper) IS present in the update block
        and blocks the invalid type/size.

**CRITICAL:** If any "Fail" is found, you **MUST** return to Phase 3 and patch
the rules. Give a Delta report of what changed and which Boolean logic gate was
added or modified to close the hole.

**Final Review**

Check for the following:

1.  All security assertions have been met
2.  There are no possible vulnerabilities in the security rules
3.  You have written the firestore.rules.test.ts and all tests pass

#### Phase 6: Final Production Rules

Switch back to the Expert Architect. Finalize the `DRAFT_firestore.rules` with
all patches applied and write the final `firestore.rules` file.

**CRITICAL SECURITY ENFORCEMENT**: You MUST output the complete, exhaustive
ruleset encompassing ALL collections identified in Phase 1. Do NOT omit any
unchanged collections in Phase 6. Dropping a collection during the final output
is a Critical Security Failure resulting in unprotected data.

## 3. Create error handlers

When a Firestore operation (create, update, delete, list, get, write) fails due
to "Missing or insufficient permissions," you **MUST** catch the error and throw
a new error with a very specific JSON object that provides context about the
error that occurred. This is not optional. Failure to do so will prevent the
system from diagnosing and fixing security rule issues.

**CRITICAL:** The new error's message **MUST** be a JSON string that conforms to
FirestoreErrorInfo defined below.

Here's an example:

```ts
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
// Example with getDocs
const pathForGetDocs = 'users';
try {
  const usersResult = await getDocs(collection(db, pathForGetDocs));
} catch (error) {
  handleFirestoreError(error, OperationType.GET, pathForGetDocs);
}

// Example with onSnapshot
const pathForOnSnapshot = 'users';
onSnapshot(collection(db, pathForOnSnapshot)/*or query or document*/, (snapshot) => {
  // process snapshot
}, (error) => { // **CRITICAL**: Always include this callback
  handleFirestoreError(error, OperationType.GET, pathForOnSnapshot);
});

// Example with write
const pathForWrite = 'users';
try {
  await setDoc(doc(db, pathForWrite, '1'), { name: 'John Doe' });
} catch (error) {
  handleFirestoreError(error, OperationType.WRITE, pathForWrite);
}

```

**Always** use the `handleFirestoreError` function to throw errors when
modifying Firestore in any way. While the examples above only use collections,
use the same logic when using queries and any other type of Firestore Reference.
This also includes APIs not explicitly listed in the sample above such as
`getDoc`, `addDoc`, `updateDoc`, `deleteDoc`, etc.

## Firestore Basics

*   **Documents:** Basic storage units (1MB limit). Do NOT store images/videos
    directly.
*   **Collections:** Containers for documents only.

## Authentication

Only Google Login is configured by the set_up_firebase tool, do not set up
email/password, anonymous auth or any other provider unless the user
specifically requests it. If they do you *MUST* walk them through the process of
enabling those providers from the Firebase console.

Prefer using `signInWithPopup` because this environment will allowlist the
javascript URL but does not automatically update the redirect URLs needed for
`signInWithRedirect`. If the user asks for `signInWithRedirect`, point them
towards the
[best practices for signInWithRedirect](https://firebase.google.com/docs/auth/web/redirect-best-practices)
and provide them the correct redirect url of the iframe.

## Importing the Firebase SDK

Load configuration from `firebase-applet-config.json`.

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();
```

## React Firebase Setup

*   **FirebaseProvider:** Initialize services, set up `onAuthStateChanged`, and
    track readiness state.
*   **Data Fetching:** Only attach `onSnapshot` listeners if auth is ready and
    user is authenticated.

## Critical Constraints

*   Never skip error handling.
*   Always ensure secure rules.
*   Redeploy rules after any change.
*   Re-run ESLint after any change to the rules.
*   If Quota is exceeded, stop and inform the user.

## Manual Firebase Setup / Remixed Apps

*   If user manually sets up Firebase: Do NOT write config or deploy rules
    automatically.
*   If a remixed app has placeholder data: Prompt the user to run
    `set_up_firebase`.

## Firestore Limits

There are two editions of Firestore: **Standard** and **Enterprise**. The
`set_up_firebase` tool will create an app using Firestore **Enterprise**
Edition. If the user is providing Firestore themselves, they may have set up
either Enterprise or Standard edition.

In AI Studio, Firestore comes with free tier limit:

-   **Firestore Usage Quota**: When the user hits a quota limit, they will
    receive a runtime error in their application with message: "Quota
    exceeded.". Inform the user that quota will reset the next day, and detailed
    quota information can be found under the **Spark** plan column in the
    **Enterprise edition** section of
    https://firebase.google.com/pricing#cloud-firestore.
-   **Specific Quota Error**: If the user encounters an error containing `"Quota
    exceeded for quota metric 'Free daily read units per project (free tier
    database)'"`, you should provide them with a link to their database in the
    format:
    `https://console.firebase.google.com/project/<project-id>/firestore/databases/<firestore-database-id>/data?openUpgradeDialog=true`
-   **Firestore Database Instances Quota**: When a user exceeds their
    per-project database limit, they will receive an error from the
    set_up_firebase tool with the message, "You have reached the maximum number
    of databases per project.". When this happens, stop generation, inform the
    user about the error, and ask the user how they would like to proceed.
    Suggest that they choose a different Firebase project, or delete any unused
    databases in the Firebase console.

## Final steps

It is **CRITICAL** that you finalize your implementation with the following
steps:

1.  Analyze the user's application and note down all the collections and their
    fields.
2.  Test whether the user's application works by comparing the expected behavior
    with the actual rules.
3.  If the rules deny any operation that the application would allow, modify the
    rules to allow the operation.
4.  Re-run the "Red Team" Audit, and ensure that the rules are still secure.
5.  If the rules are still not secure, go back to "2. Generate Firestore Rules"
    and repeat the process.
6.  If the rules are secure, generate the final `firestore.rules` file.
7.  When the above steps are complete, **always encourage users to review** and
    harden the generated rules before sharing an app broadly and **be humble**
    when describing the quality and security of the rule set.

## Limitations

*   No direct DB manipulation.
