Title: Overview - SMART App Launch v2.2.0

URL Source: https://hl7.org/fhir/smart-app-launch/

Published Time: Fri, 21 Mar 2025 19:00:05 GMT

Markdown Content:
This page is part of the Smart App Launch Implementation Guide (v2.2.0: [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use") 2.2) based on [FHIR (HL7® FHIR® Standard) R4](http://hl7.org/fhir/R4). This is the current published version. For a full list of available versions, see the [Directory of published versions](http://hl7.org/fhir/smart-app-launch/history.html)

Plain Language Summary Goes Here

_Official URL_: http://hl7.org/fhir/smart-app-launch/ImplementationGuide/hl7.fhir.uv.smart-app-launch _Version_: 2.2.0
Active as of 2023-03-01 _Computable Name_: SmartAppLaunch

*   [Discovery of Server Capabilities and Configuration](https://hl7.org/fhir/smart-app-launch/#discovery-of-server-capabilities-and-configuration)
*   [SMART Defines Two Patterns For Client _Authorization_](https://hl7.org/fhir/smart-app-launch/#smart-defines-two-patterns-for-client-authorization)
*   [SMART Defines Two Patterns For Client _Authentication_](https://hl7.org/fhir/smart-app-launch/#smart-defines-two-patterns-for-client-authentication)
*   [Scopes for Limiting Access](https://hl7.org/fhir/smart-app-launch/#scopes-for-limiting-access)
*   [Token Introspection](https://hl7.org/fhir/smart-app-launch/#token-introspection)
*   [User-Access Brands](https://hl7.org/fhir/smart-app-launch/#user-access-brands)
*   [Persisting App State](https://hl7.org/fhir/smart-app-launch/#persisting-app-state)
*   [FHIR Publication Details](https://hl7.org/fhir/smart-app-launch/#fhir-publication-details)

This implementation guide describes a set of foundational patterns based on [OAuth 2.0](https://tools.ietf.org/html/rfc6749) for client applications to authorize, authenticate, and integrate with FHIR-based data systems. The patterns defined in this specification are introduced in the sections below. For background on SMART Health IT, see [smarthealthit.org](https://smarthealthit.org/).

Portions of the specification designated as Experimental are indicated by EXP and background shading.

### [Discovery of Server Capabilities and Configuration](https://hl7.org/fhir/smart-app-launch/conformance.html)

SMART defines a discovery document, available at `.well-known/smart-configuration` relative to a FHIR Server Base URL, allowing clients to learn the authorization endpoint URLs and features a server supports. This information helps client direct authorization requests to the right endpoint, and helps clients construct an authorization request that the server can support.

### SMART Defines Two Patterns For Client _Authorization_

#### [Authorization via **SMART App Launch**](https://hl7.org/fhir/smart-app-launch/app-launch.html)

Authorizes a user-facing client application (“App”) to connect to a FHIR Server. This pattern allows for “launch context” such as a _currently selected patient_ to be shared with the app, based on a user’s session inside an EHR or other health data software, or based on a user’s selection at launch time. Authorization allows for delegation of a user’s permissions to the app itself.

#### [Authorization via **SMART Backend Services**](https://hl7.org/fhir/smart-app-launch/backend-services.html)

Authorizes a headless or automated client application (“Backend Service”) to connect to a FHIR Server. This pattern allows for backend services to connect and interact with an EHR when there is no user directly involved in the launch process, or in other circumstances where permissions are assigned to the client out-of-band.

### SMART Defines Two Patterns For Client _Authentication_

When clients need to authenticate, this implementation guide defines two methods.

_Note that client authentication is not required in all authorization scenarios, and not all SMART clients are capable of authenticating (see discussion of [“Public Clients”](https://hl7.org/fhir/smart-app-launch/app-launch.html#support-for-public-and-confidential-apps) in the SMART App Launch overview)._

#### **[Asymmetric (“private key JWT”) authentication](https://hl7.org/fhir/smart-app-launch/client-confidential-asymmetric.html)**

Authenticates a client using an asymmetric keypair. This is SMART’s preferred authentication method because it avoids sending a shared secret over the wire.

#### **[Symmetric (“client secret”) authentication](https://hl7.org/fhir/smart-app-launch/client-confidential-symmetric.html)**

Authenticates a client using a secret that has been pre-shared between the client and server.

### [Scopes for Limiting Access](https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html)

SMART uses a language of “scopes” to define specific access permissions that can be delegated to a client application. These scopes draw on FHIR API definitions for interactions, resource types, and search parameters to describe a permissions model. For example, an app might be granted scopes like `user/Encounter.rs`, allowing it to read and search for Encounters that are accessible to the user who has authorized the app. Similarly, a backend service might be granted scopes like `system/Encounter.rs`, allowing it to read and search for Encounters within the overall set of data it is configured to access. User-facing apps can also receive “launch context” to indicate details about the current patient, other aspects of a user’s EHR session, or a user’s selections when launching the app.

_Note that the scope syntax has changed since SMARTv1. Further details are in the section [Scopes for requesting FHIR resources](https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html#scopes-for-requesting-fhir-resources)._

### [Token Introspection](https://hl7.org/fhir/smart-app-launch/token-introspection.html)

SMART defines a Token Introspection API allowing Resource Servers or software components to understand the scopes, users, patients, and other context associated with access tokens. This pattern allows a looser coupling between Resource Servers and Authorization Servers.

### [User-Access Brands](https://hl7.org/fhir/smart-app-launch/brands.html)

SMART defines a publication format for API providers to make branding information available to patient-facing apps. This helps apps offer a “connect to my records” UX where providers appear with the names, logos, and descriptions they choose.

### [Persisting App State](https://hl7.org/fhir/smart-app-launch/app-state.html)

SMART defines an API for apps to persist state to an EHR, allowing apps to save configuration details including user- or patient-specific payloads.

### FHIR Publication Details

#### Intellectual Property Statements

This publication includes IP covered under the following statements.

*   This material derives from the HL7 Terminology (THO). THO is copyright ©1989+ Health Level Seven International and is made available under the CC0 designation. For more licensing information see: [https://terminology.hl7.org/license](https://terminology.hl7.org/license)
Show Usage

*   This material derives from the HL7 Terminology (THO). THO is copyright ©1989+ Health Level Seven International and is made available under the CC0 designation. For more licensing information see: [https://terminology.hl7.org/license](https://terminology.hl7.org/license)Some content from IHE® Copyright © 2015 IHE International, Inc. The IHE concepts are from the IHE Technical Frameworks and Supplements, available for free download and use at [http://www.ihe.net/Technical_Frameworks/](http://www.ihe.net/Technical_Frameworks/)
Show Usage

#### Cross Version Analysis

_Note: While this publication includes artifacts for FHIR R4, SMART App Launch is compatible with any version of FHIR from DSTU2 and onward._

This is an R4 IG. None of the features it uses are changed in R4B, so it can be used as is with R4B systems. Packages for both [R4 (hl7.fhir.uv.smart-app-launch.r4)](https://hl7.org/fhir/smart-app-launch/package.r4.tgz) and [R4B (hl7.fhir.uv.smart-app-launch.r4b)](https://hl7.org/fhir/smart-app-launch/package.r4b.tgz) are available.

#### Package Dependencies

_Note: While this publication includes artifacts for FHIR R4, SMART App Launch is compatible with any version of FHIR from DSTU2 and onward._

| IG | Package | FHIR |
| --- | --- | --- |
| ![Image 1: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 2: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)SMART App Launch | [hl7.fhir.uv.smart-app-launch#2.2.0](https://simplifier.net/packages/hl7.fhir.uv.smart-app-launch/2.2.0) | [R4](http://hl7.org/fhir/R4) |
| ![Image 3: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 4: .](blob:http://localhost/d1246041dd5eb94d735e370d4838cfe6)![Image 5: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[FHIR Extensions Pack](http://hl7.org/fhir/extensions/5.1.0-snapshot1 "Canonical: http://hl7.org/fhir/extensions") | [hl7.fhir.uv.extensions#5.1.0-snapshot1](https://simplifier.net/packages/hl7.fhir.uv.extensions/5.1.0-snapshot1) | [R5](http://hl7.org/fhir/R5) |
| ![Image 6: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 7: .](blob:http://localhost/2e92ed827e65e38acedf134baa20ed76)![Image 8: .](blob:http://localhost/c2180534dc45aeade74cf897b240ce94)![Image 9: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[HL7 Terminology (THO)](http://terminology.hl7.org/5.3.0 "Canonical: http://terminology.hl7.org") | [hl7.terminology.r5#5.3.0](https://simplifier.net/packages/hl7.terminology.r5/5.3.0) | [R5](http://hl7.org/fhir/R5) |
| ![Image 10: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 11: .](blob:http://localhost/c2180534dc45aeade74cf897b240ce94)![Image 12: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[HL7 Terminology (THO)](http://terminology.hl7.org/5.5.0 "Canonical: http://terminology.hl7.org") | [hl7.terminology#5.5.0](https://simplifier.net/packages/hl7.terminology/5.5.0) | [R4](http://hl7.org/fhir/R4) |
| ![Image 13: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 14: .](blob:http://localhost/b134ba784cf819c68ccbf4ea6b63fee0)![Image 15: .](blob:http://localhost/c2180534dc45aeade74cf897b240ce94)![Image 16: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[FHIR Extensions Pack](http://hl7.org/fhir/extensions/1.0.0 "Canonical: http://hl7.org/fhir/extensions") | [hl7.fhir.uv.extensions.r4#1.0.0](https://simplifier.net/packages/hl7.fhir.uv.extensions.r4/1.0.0) | [R4](http://hl7.org/fhir/R4) |

**Package hl7.fhir.uv.extensions#5.1.0-snapshot1**

This IG defines the global extensions - the ones defined for everyone. These extensions are always in scope wherever FHIR is being used (built Tue, Mar 12, 2024 13:29+1100+11:00)

**Package hl7.fhir.uv.extensions.r4#1.0.0**

This IG defines the global extensions - the ones defined for everyone. These extensions are always in scope wherever FHIR is being used (built Sun, Mar 26, 2023 08:46+1100+11:00)

#### Global Profile Definitions

_There are no Global profiles defined_
