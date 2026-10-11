Title: SMART Health Cards and Links IG v1.0.0

URL Source: https://hl7.org/fhir/uv/smart-health-cards-and-links/

Markdown Content:
This page is part of the SMART Health Cards and Links FHIR IG (v1.0.0: [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use")1) based on [FHIR (HL7® FHIR® Standard) R4](http://hl7.org/fhir/R4). This is the current published version. For a full list of available versions, see the [Directory of published versions](http://hl7.org/fhir/uv/smart-health-cards-and-links/history.html)

## Home Page[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#home-page)

_Official URL_: http://hl7.org/fhir/uv/smart-health-cards-and-links/ImplementationGuide/hl7.fhir.uv.smart-health-cards-and-links _Version_: 1.0.0
_IG Standards status:_[Trial-use](http://hl7.org/fhir/R4/versions.html#std-process "Standard Status")[Maturity Level](http://hl7.org/fhir/versions.html#maturity): 4 _Computable Name_: SMARTHealthCardsandLinks

*   [Overview](https://hl7.org/fhir/uv/smart-health-cards-and-links/#overview)
*   [IG Organization](https://hl7.org/fhir/uv/smart-health-cards-and-links/#ig-organization)
*   [Referenced Specifications](https://hl7.org/fhir/uv/smart-health-cards-and-links/#referenced-specifications)
*   [Contributing](https://hl7.org/fhir/uv/smart-health-cards-and-links/#contributing)
*   [Sponsoring HL7 Workgroup](https://hl7.org/fhir/uv/smart-health-cards-and-links/#sponsoring-hl7-workgroup)
*   [Authors](https://hl7.org/fhir/uv/smart-health-cards-and-links/#authors)
*   [Dependencies](https://hl7.org/fhir/uv/smart-health-cards-and-links/#dependencies)
*   [Cross Version Analysis](https://hl7.org/fhir/uv/smart-health-cards-and-links/#cross-version-analysis)
*   [Global Profiles](https://hl7.org/fhir/uv/smart-health-cards-and-links/#global-profiles)
*   [IP Statements](https://hl7.org/fhir/uv/smart-health-cards-and-links/#ip-statements)

### Overview[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#overview)

Paper medical records–such as vaccination histories and insurance cards–are easily lost or damaged, are difficult to authenticate, and are often not on-hand when they’re needed.

SMART Health Cards and Links are FHIR-based standards that address these challenges, enabling individuals to receive their health information and share it with others in a tamper-proof and verifiable digital form. The standards can also be used to share information that doesn't need to be verified by the receiver. They provide a digital version of an individual's clinical information that can be kept at the ready and easily shared with others when the need arises–using a QR code, mobile app or web browser.

Together SMART Health Cards and Links provide options that support multiple goals–from keeping a small amount of verifiable medical information close by to authorizing a trusted party to access their entire medical record. They empower individuals with secure, equitable, and privacy-preserving access to their clinical information.

Examples of what an individual can do using these standards include:

*   receive proof of critical immunizations on a physical card or in a mobile app and allow others to verify them by scanning the attached QR code
*   using a SMART Health Link to transmit their member ID when checking in at their doctor's office
*   send an elementary school a link to their child's immunization history, allowing the school to verify the information with the immunization registry and copy in the details if it wishes
*   receive a "ticket" to access the results of a lab test when they're ready
*   give a provider time-limited or ongoing access to some or all of their medical data, including the ability to search
*   scan a prescription bottle to receive the full prescription details.

### IG Organization[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#ig-organization)

The implementation guide is organized into two sections:

*   **SMART Health Cards** describes the protocol that allows an individual to keep a copy of their important health records with them in the form of a secure QR code that may be saved digitally or printed on paper. SMART Health Cards build on international open standards and decentralized infrastructure to provide end-user privacy and the ability to work across organizational and jurisdictional boundaries. This section includes: 
    *   [Health Cards user stories](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-user-stories.html)
    *   the formal [Health Cards specification](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-specification.html)
    *   the [Issue Verifiable Credential operation](https://hl7.org/fhir/uv/smart-health-cards-and-links/OperationDefinition-patient-i-health-cards-issue.html) for requesting and generating SMART Health Cards
    *   a description of [Health Cards credential modeling](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-credential-modeling.html)
    *   [SMART Health Card examples](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-examples.html)
    *   a [Health Cards FAQ](https://hl7.org/fhir/uv/smart-health-cards-and-links/frequently-asked-questions.html)
    *   the historical [log of changes to the SMART Health Cards specification](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-changelog.html) prior to it becoming an HL7 standard

*   **SMART Health Links** describes the protocol that enables storage and sharing of more information than can be kept on a single SMART Health Card (using cloud storage) and provides additional sharing options including limited-time access, long-term sharing of data that can evolve over time, and protecting access with a PIN that can be communicated to the recipient out-of-band. This section contains: 
    *   [Health Links user stories](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-user-stories.html)
    *   the formal [Health Links specification](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html)
    *   [Health Link examples](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-examples.html)

*   **FHIR Artifacts** contains FHIR resource profiles and logical models referenced from the SMART Health Cards and SMART Health Links sections.

*   **Change Log** identifies specification changes present in this version of the implementation guide.

In addition, there is a **[glossary](https://hl7.org/fhir/uv/smart-health-cards-and-links/glossary.html)** of related terms and abbreviations used throughout the guide.

### Referenced Specifications[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#referenced-specifications)

This implementation guide relies on the following external specifications:

*   [IETF (Internet Engineering Task Force) RFC 7515 - JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
*   [IETF RFC 7517 - JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)
*   [IETF RFC 7517 - JSON Web Key Set (JWK Set)](https://tools.ietf.org/html/rfc7517#section-5)
*   [IETF RFC 7518 - JSON Web Algorithms (JWA)](https://datatracker.ietf.org/doc/html/rfc7518)
*   [IETF RFC 7519 - JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
*   [IETF RFC 7638 - JSON Web Key (JWK) Thumbprint](https://datatracker.ietf.org/doc/html/rfc7638)
*   [IETF Network Working Group RFC 1951 - DEFLATE Compressed Data Format Specification version 1.3](https://www.ietf.org/rfc/rfc1951.txt)
*   [IETF Network Working Group RFC 4648 - Base64 Data Encodings](https://datatracker.ietf.org/doc/html/rfc4648)
*   [IETF Network Working Group RFC 4868 - Using HMAC-SHA-256, HMAC-SHA-384, and HMAC-SHA-512 with IPsec](https://datatracker.ietf.org/doc/html/rfc4868)
*   [IETF Network Working Group RFC 5280 - X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL)](https://datatracker.ietf.org/doc/html/rfc5280)
*   [IETF BCP 195 - Transport Layer Security (TLS)](https://www.rfc-editor.org/info/bcp195)
*   [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)

### Contributing[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#contributing)

The Verifiable Clinical Information (VCI) coalition convened the original consensus group that started the work that led to this implementation guide. The Argonaut Project and CARIN Alliance were also key contributors.

[FHIR Infrastructure](https://confluence.hl7.org/display/FHIRI)

### Authors[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#authors)

### Dependencies[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#dependencies)

| IG | Package | FHIR | Comment |
| --- | --- | --- | --- |
| ![Image 1: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 2: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)SMART Health Cards and Links IG | [hl7.fhir.uv.smart-health-cards-and-links#1.0.0](https://simplifier.net/packages/hl7.fhir.uv.smart-health-cards-and-links/1.0.0) | [R4](http://hl7.org/fhir/R4) |  |
| ![Image 3: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 4: .](blob:http://localhost/c84b0b45bd95fa0eef287524bc7602cf)![Image 5: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[HL7 Terminology (THO)](http://terminology.hl7.org/6.5.0 "Canonical: http://terminology.hl7.org") | [hl7.terminology.r4#6.5.0](https://simplifier.net/packages/hl7.terminology.r4/6.5.0) | [R4](http://hl7.org/fhir/R4) | Automatically added as a dependency - all IGs depend on HL7 Terminology |
| ![Image 6: .](blob:http://localhost/d643e65f8313b8f1583eb93fc86e0c91)![Image 7: .](blob:http://localhost/b134ba784cf819c68ccbf4ea6b63fee0)![Image 8: .](blob:http://localhost/c2180534dc45aeade74cf897b240ce94)![Image 9: .](blob:http://localhost/7c436e36a647eb79e4321aecec21ac40)[FHIR Extensions Pack](http://hl7.org/fhir/extensions/5.2.0 "Canonical: http://hl7.org/fhir/extensions") | [hl7.fhir.uv.extensions.r4#5.2.0](https://simplifier.net/packages/hl7.fhir.uv.extensions.r4/5.2.0) | [R4](http://hl7.org/fhir/R4) |  |

**Package hl7.fhir.uv.extensions.r4#5.2.0**

This IG defines the global extensions - the ones defined for everyone. These extensions are always in scope wherever FHIR is being used (built Mon, Feb 10, 2025 21:45+1100+11:00)

### Cross Version Analysis[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#cross-version-analysis)

This is an R4 IG. None of the features it uses are changed in R4B, so it can be used as is with R4B} systems. Packages for both [R4 (hl7.fhir.uv.smart-health-cards-and-links.r4)](https://hl7.org/fhir/uv/smart-health-cards-and-links/package.r4.tgz) and [R4B (hl7.fhir.uv.smart-health-cards-and-links.r4b)](https://hl7.org/fhir/uv/smart-health-cards-and-links/package.r4b.tgz) are available.

### Global Profiles[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#global-profiles)

_There are no Global profiles defined_

### IP Statements[](https://hl7.org/fhir/uv/smart-health-cards-and-links/#ip-statements)

This publication includes IP covered under the following statements.

*   This material derives from the HL7 Terminology (THO). THO is copyright ©1989+ Health Level Seven International and is made available under the CC0 designation. For more licensing information see: [https://terminology.hl7.org/license.html](https://terminology.hl7.org/license.html)
Show Usage
