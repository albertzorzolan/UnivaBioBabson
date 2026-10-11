Title: Health Links Specification - SMART Health Cards and Links IG v1.0.0

URL Source: https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html

Markdown Content:
This page is part of the SMART Health Cards and Links FHIR IG (v1.0.0: [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use")1) based on [FHIR (HL7® FHIR® Standard) R4](http://hl7.org/fhir/R4). This is the current published version. For a full list of available versions, see the [Directory of published versions](http://hl7.org/fhir/uv/smart-health-cards-and-links/history.html)

*   [SMART Health Link (SHL) Use Cases](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-shl-use-cases)
*   [Design Goals](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#design-goals)
*   [Actors](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#actors)
*   [Pre-protocol step: Sharing User Configures a New SMART Health Link](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#pre-protocol-step-sharing-user-configures-a-new-smart-health-link)
*   [SMART Health Links Sharing Application Generates a SMART Health Link URI](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-links-sharing-application-generates-a-smart-health-link-uri)
*   [Sharing User Transmits a SMART Health Link](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#sharing-user-transmits-a-smart-health-link)
*   [SMART Health Links Receiving Application Processes a SMART Health Link](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-links-receiving-application-processes-a-smart-health-link)
*   [SMART Health Link Manifest Request](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-manifest-request)
*   [Encrypting and Decrypting Files](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files)
*   [Conformance and User-Facing Identification](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#conformance-and-user-facing-identification)
*   [Use Case Examples](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#use-case-examples)

### SMART Health Link (SHL) Use Cases[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-shl-use-cases)

*   Share a link to any collection of FHIR data, including signed data
*   Share link to a static SMART Health Card (SHC) that's too big to fit in a QR
*   Share link to a "dynamic" SMART Health Card – i.e., a file that can evolve over time (e.g., "my most recent COVID-19 lab results")
*   Share a link to Bundles of patient-supplied data (e.g., "my advance directive" to share with EMS, or "my at-home weight measurements" to share with a weight loss program, or "my active prescriptions" to share with a service that helps you find better drug prices) 
    *   Note that for specific use cases, these data don't need to be tamper-proof, and could be aggressively stripped down (e.g., for a drug pricing service, just the drug codes and dosage would go a long way)

*   Provision access to a patient's SMART on FHIR API endpoint (e.g., "I'm going to see a specialist and by presenting a single QR, I can give them access to the FHIR API from my primary care provider's portal")

### Design Goals[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#design-goals)

*   Allow sharing of tamper-proof data
*   Allow sharing of non-tamper-proof data
*   Allow long-term sharing of data
*   Allow sharing data that can evolve over time
*   Mitigate the damage of QRs being leaked or scanned by the wrong party 
    *   Allow generate of "one-time use" QR (or a limited-time use QR), so at the time of creation there's a limited number of "claims" or a limited time period attached to it
    *   Allow protecting the QR with a PIN, which the Sharer can communicate the PIN to the Recipient out-of-band

*   Give Data Sharers the option to host files using encrypted cloud storage, so the hosting provider can't see file contents. (This is mainly important in cases where the data originates from a clinical data system but passes through the consumer's hands and then is hosted online in a cloud service of the consumer's choice. For example, a consumer health app might periodically upload a "most recent labs" file compiled from various sources, and the consumer shouldn't need to trust the file hosting service to actually see plaintext lab results.)
*   Offer a simple UX where Data Recipients can scans a QR and immediately retrieve the data
*   Offer a glide path for upgraded assurance, e.g. allowing Data Sharers to define a PIN or even (someday) require the Data Recipient party to authenticate or id-proof before accessing shared data

### Actors[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#actors)

*   Software Applications 
    *   **SMART Health Links Sharing Application**. Software that is used to create, manage, and share SMART Health Links. Also referred to below as "server". This application can include local software as well as server-side components.
    *   **SMART Health Links Receiving Application**. Software that enables users to receive and access health information shared through SMART Health Links. Also referred to below as a "client", this application can take many forms, including a lightweight web page with Javascript, a full-fledged module in a native EHR system, or a standalone mobile app.

*   Users 
    *   **Sharing User**. An individual working with a SMART Health Links Sharing Application to create/manage/share information
    *   **Receiving User**. An individual working with a SMART Health Links Receiving Application to retrieve/display/use information. In autonomous use cases there may be no Receiving User.

### Pre-protocol step: Sharing User Configures a New SMART Health Link[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#pre-protocol-step-sharing-user-configures-a-new-smart-health-link)

Working with a [SMART Health Links Sharing Application](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#actors), the Sharing User makes a few decisions up front:

*   **What to share**. Depending on the SMART Health Links Sharing Application, the Sharing User might explicitly choose a set of files or define a "sharing policy" that matches different data over time.
*   **Whether the SMART Health Links will require a Passcode** to access. Depending on the SMART Health Links Sharing Application, a Passcode may be mandatory.
*   **Whether the SMART Health Links will expire** at some pre-specified time. Depending on the SMART Health Links Sharing Application, an expiration time may be mandatory.

Regarding "what to share": a single SMART Health Link at a specific point in time will _resolve_ to a manifest of files of the following types:

*   `application/smart-health-card`: a JSON file with a `.verifiableCredential` array containing SMART Health Card JWS strings, as specified in the [via File Download](https://hl7.org/fhir/uv/smart-health-cards-and-links/cards-specification.html#via-file-download) section of the SMART Health Cards specification.
*   `application/fhir+json`: a JSON file containing any FHIR resource (e.g., an individual resource or a Bundle of resources). Note that this format is not inherently tamper-proof, but the content may include digital signatures or have other verification processes associated with it, which are not defined here.
*   `application/smart-api-access`: a JSON file with a SMART Access Token Response (see [SMART App Launch](https://hl7.org/fhir/smart-app-launch/app-launch.html#response-5)). Two additional properties are defined: 
    *   `aud` Required string indicating the FHIR Server Base URL where this token can be used (e.g., `"https://server.example.org/fhir"`)
    *   `query`: Optional array of strings acting as hints to the client, indicating queries it might want to make (e.g., `["Coverage?patient=123&_tag=family-insurance"]`)

At configuration time, the SMART Health Links Sharing Application SHALL generate a random key used for encrypting/decrypting the files in the manifest (see ["Decryption"](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files)).

INFO

**📓 Design Note: Trust and encryption**

This pattern of encrypting files allows for deployment scenarios where the file server is not trusted to know the information inside the manifest's files. In such scenarios, the Sharing User and Receiving User can consider the server a blind intermediary. That said: in many deployment scenarios, the file server will be hosted by a healthcare provider or other entity that already has access to such files. For consistency, this protocol always applies encryption.

INFO

**📓 Design Note: SMART Health Links Sharing Application "Internals"**

We do not standardize the protocol by which the SMART Health Links Sharing Application's local software communicates with its server-side components. These may be provided by the same vendor and use internal APIs to communicate -- or there may be no "local" software at all.

### SMART Health Links Sharing Application Generates a SMART Health Link URI[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-links-sharing-application-generates-a-smart-health-link-uri)

#### Establish a SMART Health Link Manifest URL[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#establish-a-smart-health-link-manifest-url)

Based the configuration from (1), the SMART Health Links Sharing Application generates a "manifest URL" for the new SMART Health Links. The manifest URL:

*   SHALL include at least **256 bits of entropy**
    *   A suggested approach is to generate a cryptographically strong 32-byte random sequence and then base64url-encode this sequence to obtain a 43-character string that is used as a path segment. For example: `https://shl.example.org/manifests/I91rhba3VsuGXGchcnr6VHlQFKxfE28kuZ0ssbEuxno/manifest.json`

*   SHALL NOT exceed **128 characters** in length (note, this maximum applies to the `url` field of the SMART Health Link Payload, not to the entire SMART Health Link URI).

The SMART Health Links Sharing Application incorporates the manifest URL into a SMART Health Link as described below.

#### Construct a SMART Health Link Payload[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#construct-a-smart-health-link-payload)

The SMART Health Link Payload is a JSON object including the following properties:

**Property****Optionality****Type****Description**
url 1..1 url Manifest URL for this SMART Health Link
key 1..1 base64 url encoded string Decryption key for processing files returned in the manifest. 43 characters, consisting of 32 random bytes base64urlencoded
exp 0..1 number Number representing expiration time in Epoch seconds, as a hint to help the SMART Health Links Receiving Application determine if this QR is stale. (Note: epoch times should be parsed into 64-bit numeric types.)
flag 0..1 string String created by concatenating single-character flags in alphabetical order  

*   L Indicates the SMART Health Link is intended for long-term use and manifest content can evolve over time 
*   P Indicates the SMART Health Link requires a Passcode to resolve
*   U Indicates the SMART Health Links's `url` resolves to a single encrypted file accessible via `GET`, bypassing the manifest. SHALL NOT be used in combination with P
label 0..1 string String no longer than 80 characters that provides a short description of the data behind the SMART Health Link
v 0..1 number Integer representing the SMART Health Links protocol version this SMART Health Link conforms to. MAY be omitted when the default value (1) applies

_The ShlPayload logical model can be found [here](https://hl7.org/fhir/uv/smart-health-cards-and-links/StructureDefinition-ShlPayload.html)._

The JSON Payload is then:

*   Minified
*   Base64urlencoded
*   Prefixed with `shlink:/`
*   Optionally prefixed with a viewer URL that ends with `#`

INFO

**📓 Design Note: Design Note: Protocol Versioning**

Implementations can rely on the following behaviors:

*   SMART Health Link Payload processing for `shlink:` URIs
    *   SMART Health Link Payloads SHALL be constructed as per `"v":1` (i.e., payloads are Base64urlencoded, minified JSON objects)
        *   Any changes to this design will require a new URI scheme, rather than a `v` bump

*   SMART Health Link Payload stability
    *   `.label`, `.exp`, and `.flag` SHALL always work as defined for `"v":1`
        *   Any changes to this design will require a new URI scheme, rather than a `v` bump

    *   New properties MAY be introduced without a version bump, as long as they're optional and safe to ignore
    *   SHL Receiving Application SHALL ignore properties they don't recognize
    *   Introduction of properties that can't safely be ignored will require a `v` bump

*   SMART Health Link Payload flags
    *   New flag values MAY be introduced without a version bump, as long as they're safe to ignore. For example, the v1 flag `L` is safe to ignore because the client will still be able to handle a one-time manifest request. The `P` flag however cannot be ignored because the server will respond with an error if no passcode is provided.
    *   SHL Receiver Application SHALL ignore flag values they don't recognize
    *   Introduction of new flag values that can't safely be ignored will require a `v` bump

*   Manifest URL request/response
    *   New request parameters or headers MAY be introduced without a version bump, as long as they're optional and safe to ignore, or gated by a flag or property in the SHL Payload
    *   New response parameters or headers MAY be introduced without a version bump, as long as they're optional and safe to ignore, or gated by a request parameter
    *   SHL Sharing Application and SHL Receiving Application SHALL ignore parameters and headers they don't recognize
    *   Introduction of parameters or headers that can't safely be ignored will require a `v` bump

*   Encryption and signature schemes
    *   Changes to the cryptographic protocol will require a `v` bump

This means that SHL Receiver Applications can always recognize a SMART Health Link Payload and display its label to the user. If a SHL Receiver Application receives a SMART Health Link with a `v` newer than what it supports, it SHOULD display an appropriate message to the user and SHOULD NOT proceed with a manifest request, unless it has some reason to believe that proceeding is safe.

INFO

**📓 Design Note: Design Note: Viewer URL Prefixes**

By using viewer URLs that end in `#`, we take advantage of the browser behavior where `#` fragments are not sent to a server at the time of a request. Thus the SMART Health Link payload will not appear in server-side logs or be available to server-side processing when a link like `https://viewer.example.org#shlink:/ey...` is opened in a browser.

The following optional step may occur sometime after a SMART Health Link is generated:

*   **Optional: Update Shared Files**. For some sharing scenarios, Sharing User MAY update the shared files from time to time (e.g., when new lab results arrive or new immunizations are performed). Updated versions SHALL be encrypted using the same key as the initial version.

#### Including Signatures in a SMART Health Link Payload[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#including-signatures-in-a-smart-health-link-payload)

Downstream implementation guides may further specify how to add signatures to a SMART Health Link payload, under the conditions listed at [Conformance and User-Facing Identification](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#conformance-and-user-facing-identification).

However, if the result is a SMART Health Link that clients can process as usual while ignoring the signature (e.g., a detached signature added as a property within the existing JSON SMART Health Link structure, next to label/flag/etc.), the resulting artifact can still be called a SMART Health Link in user-facing contexts

#### Including Additional Client Authentication[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#including-additional-client-authentication)

Downstream implementation guides can optionally layer on additional client authentication protocols in order to ensure that a purported SHL Sharing Application is a trusted service.

Such additional protocols might include features such as mTLS or an "aud" claim in a client-supplied JWT, which would prevent a "man-in-the-middle" attacker from forwarding on a request to a real server (e.g., because the "aud" claim in the client authentication wouldn't match).

Note that an implementation imposing additional controls would not be compatible with clients that were ignorant of the server-specific constraints. See [Conformance and User-Facing Identification](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#conformance-and-user-facing-identification) section for applicable restrictions.

#### Extensions[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#extensions)

To support extensions, the specification provides the following features:

**For extensibility on the manifest**:

*   A FHIR[List resource](https://[hl7.org/fhir/list.html) provides a designated location for extensions related to the manifest or individual files using the standard FHIR[extension](https://hl7.org/fhir/extensibility.html) mechanism.
*   The structure and specific extensions allowed within this `List` resource may be further defined by downstream implementation guides.
*   Clients SHALL ignore FHIR extensions they do not understand.

**For extensibility on SHL payload JSON**:

*   The specification reserves the name,`extension`,and will never define an element with that name.
*   In addition, property names beginning with an underscore ("_") are reserved for extensions defined by downstream implementation guides or specific implementations.
*   Extension property names SHOULD be kept short due to payload size constraints, especially when SMART Health Links are represented as QR codes.
*   SMART Health Link Receiving Applications SHALL ignore extension properties they do not understand.

#### Example SMART Health Link Generation[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#example-smart-health-link-generation)

```
import { encode as b64urlencode } from 'https://deno.land/std@0.82.0/encoding/base64url.ts';

const shlinkJsonPayload = {
  "url": "https://ehr.example.org/qr/Y9xwkUdtmN9wwoJoN3ffJIhX2UGvCL1JnlPVNL3kDWM/m",
  "flag": "LP",
  "key": "rxTgYlOaKJPFtcEd0qcceN8wEU4p94SqAwIWQe6uX7Q",
  "label": "Back-to-school immunizations for Oliver Brown"
}

const encodedPayload = b64urlencode(JSON.stringify(shlinkJsonPayload))
// "eyJ1cmwiOiJodHRwczovL2Voci5leGFtcGxlLm9yZy9xci9ZOXh3a1VkdG1OOXd3b0pvTjNmZkpJaFgyVUd2Q0wxSm5sUFZOTDNrRFdNL20iLCJmbGFnIjoiTFAiLCJrZXkiOiJyeFRnWWxPYUtKUEZ0Y0VkMHFjY2VOOHdFVTRwOTRTcUF3SVdRZTZ1WDdRIiwibGFiZWwiOiJCYWNrLXRvLXNjaG9vbCBpbW11bml6YXRpb25zIGZvciBPbGl2ZXIgQnJvd24ifQ"

const shlinkBare = `shlink:/` + encodedPayload;
// "shlink:/eyJ1cmwiOiJodHRwczovL2Voci5leGFtcGxlLm9yZy9xci9ZOXh3a1VkdG1OOXd3b0pvTjNmZkpJaFgyVUd2Q0wxSm5sUFZOTDNrRFdNL20iLCJmbGFnIjoiTFAiLCJrZXkiOiJyeFRnWWxPYUtKUEZ0Y0VkMHFjY2VOOHdFVTRwOTRTcUF3SVdRZTZ1WDdRIiwibGFiZWwiOiJCYWNrLXRvLXNjaG9vbCBpbW11bml6YXRpb25zIGZvciBPbGl2ZXIgQnJvd24ifQ"

const shlink = `https://viewer.example.org#` + shlinkBare
// "https://viewer.example.org#shlink:/eyJ1cmwiOiJodHRwczovL2Voci5leGFtcGxlLm9yZy9xci9ZOXh3a1VkdG1OOXd3b0pvTjNmZkpJaFgyVUd2Q0wxSm5sUFZOTDNrRFdNL20iLCJmbGFnIjoiTFAiLCJrZXkiOiJyeFRnWWxPYUtKUEZ0Y0VkMHFjY2VOOHdFVTRwOTRTcUF3SVdRZTZ1WDdRIiwibGFiZWwiOiJCYWNrLXRvLXNjaG9vbCBpbW11bml6YXRpb25zIGZvciBPbGl2ZXIgQnJvd24ifQ"
```

### Sharing User Transmits a SMART Health Link[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#sharing-user-transmits-a-smart-health-link)

The Sharing User can convey a SMART Health Link by any common means including e-mail, secure messaging, or other text-based communication channels. When presenting a SMART Health Link in person, the Sharing User can also display the link as a QR code using any standard library to create a QR image from the SMART Health Link URI.

When sharing a SMART Health Link via QR code, the following recommendations apply:

*   Create the QR with Error Correction Level M
*   Consider presenting the SMART Logo in close approximation with the QR. See the [Boston Children's Hospital SMART Logo Page](https://smarthealthit.org/smart-logo-for-smart-health-cards)for details

The Sharing Application SHOULD NOT require additional supporting material from the Requesting Application. See [Conformance and User-Facing Identification](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#conformance-and-user-facing-identification) section for applicable restrictions.

### SMART Health Links Receiving Application Processes a SMART Health Link[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-links-receiving-application-processes-a-smart-health-link)

The SMART Health Links Receiving Application can process a SMART Health Link using the following steps.

*   Decode the SMART Health Link JSON payload
*   Issue a [SMART Health Link Manifest Request](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-manifest-request) to payload's `url`
*   Decrypt and process files from the manifest
*   Optional: When the original QR includes the `L` flag for long-term use, the SMART Health Links Receiving Application can re-fetch the manifest periodically, following [polling guidance](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#polling-manifest-for-changes) to avoid issing too many requests

### SMART Health Link Manifest Request[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-manifest-request)

When no `U` flag is present, the SMART Health Links Receiving Application SHALL retrieve a SMART Health Links's manifest by issuing a request to the `url` as follows:

*   Method: `POST`
*   Headers: 
    *   `content-type: application/json`

*   Body: 
    *   JSON object containing:

**Property****Optionality****Type****Description**
recipient 1..1 string A string describing the recipient (e.g.,the name of an organization or person) suitable for display to the Receiving User
passcode 0..1 string SHALL be populated with a user-supplied Passcode if the `P` flag was present in the SMART Health Link payload
embeddedLengthMax 0..1 integer Integer upper bound on the length of embedded payloads (see [`.files.embedded`](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#filesembedded-content))

If the SMART Health Link is no longer active, the Resource Server SHALL respond with a 404.

If an invalid Passcode is supplied, the Resource Server SHALL reject the request and SHALL enforce a total lifetime count of incorrect Passcodes for a given SMART Health Links, to prevent attackers from performing an exhaustive Passcode search. The error response for an invalid Passcode SHALL use the `401` HTTP status code and the response body SHALL be a JSON payload with

*   `remainingAttempts`: number of attempts remaining before the SMART Health Links is disabled

INFO

**📓 Design Note: Monitoring remaining attempts**

Servers need to enforce a total lifetime count of incorrect Passcodes even in the face of attacks that attempt multiple Passcodes in separate, parallel HTTP requests (i.e., with little or no delay between requests). For example, servers might employ measures to limit the number of in-flight requests for a single SMART Health Link at any given time, ensuring that requests are processed serially through the use of synchronization or shared state.

#### SMART Health Link Manifest File[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-manifest-file)

If the SMART Health Link request is valid, the Resource Server SHALL return a SMART Health Link Manifest File with `content-type: application/json`. The SMART Health Link Manifest File is a JSON object containing a listing of available content items in the following structure:

**Element****Optionality****Type****Description**
Manifest 1..1 JSON object SMART Health Link Manifest File object
status 0..1 string Indicates whether files may be changed in the future (fixed values, see below)
list 0..1 FHIR List resource Property containing a List resource with metadata related to contained files
files 0..*JSON object Object containing metadata related to one or more contained files
contentType 1..1 string Nature of the content (fixed values, see below)
location 0..1 *url URL to the content
embedded 0..1 *JSON Web Encryption (JWE) string Encrypted file contents
lastUpdated 0..1 ISO 8601 timestamp Last time the content was modified

_The ShlManifest logical model can be found [here](https://hl7.org/fhir/uv/smart-health-cards-and-links/StructureDefinition-ShlManifest.html)._

#### `status` property[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#status-property)

If present, the optional `status` value is a string indicating whether files may change in the future. Values are: `"finalized"|"can-change"|"no-longer-valid"`

#### `list` property[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#list-property)

The optional `list` property contains a FHIR List resource with metadata related to files contained within the Manifest object's `files` array.

#### `files` array[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#files-array)

Each entry in the `files` array includes:

*   `contentType`: One of the following values: 
    *   `"application/smart-health-card"` or
    *   `"application/smart-api-access"` or
    *   `"application/fhir+json"` with optional `fhirVersion` parameter 
        *   Servers SHOULD populate the `fhirVersion` parameter; for example: `"application/fhir+json;fhirVersion=4.0.1"`
        *   If absent, clients MAY assume the `fhirVersion` equals 4.0.1.
        *   Values are defined in the [FHIR version valueset](https://www.hl7.org/fhir/valueset-FHIR-version.html).

*   `location` (SHALL be present if no `embedded` content is included): URL to the file. This URL SHALL be short-lived and intended for single use. For example, it could be a short-lifetime signed URL to a file hosted in a cloud storage service (see signed URL docs for [S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html), [Azure](https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas), and [GCP](https://cloud.google.com/storage/docs/access-control/signed-urls)).
*   `embedded` (SHALL be present if no `location` is included): JSON string directly embedding the encrypted contents of the file as a compact JSON Web Encryption string (see ["Encrypting"](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files)).

Note that both `location` and `embedded` MAY be present. In that case, the `embedded` content and the content referenced by `location` SHALL be identical.

In addition to the the required elements above, the following optional property may be used to further characterize an entry:

*   `lastUpdated: ISO 8601 timestamp`
    *   If present, the optional `lastUpdated` value is an ISO 8601 timestamp indicating the last time the file was modified.

#### `.files.location` links[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#fileslocation-links)

The SMART Health Links Sharing Application SHALL ensure that `.files.location` links can be dereferenced without additional authentication, and that they are short-lived. The lifetime of `.files.location` links SHALL NOT exceed one hour. The SMART Health Links Sharing Application MAY create one-time-use `.files.location` links that are consumed as soon as they are dereferenced.

Because the manifest and associated files are a single package that may change over time, the SMART Health Links Receiving Application SHALL treat any manifest file locations as short-lived and potentially limited to one-time use. The SMART Health Links Receiving Application SHALL NOT attempt to dereference a manifest's `.files.location` link more than one hour after requesting the manifest, and SHALL be capable of re-fetching the manifest to obtain fresh `location` links in the event that they have expired or been consumed.

The SMART Health Links Sharing Application SHALL respond to the `GET` requests for `.files.location` URLs with:

*   Headers: 
    *   `content-type: application/jose`

*   Body: JSON Web Encryption as described in [Encrypting and Decrypting Files](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files).

#### `.files.embedded` content[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#filesembedded-content)

If the client has specified `embeddedLengthMax` in the manifest request, the sever SHALL NOT embedded payload longer than the client-designated maximum.

If present, the `embedded` value SHALL be up-to-date as of the time the manifest is requested. If the client has specified `embeddedLengthMax` in the manifest request, the sever SHALL NOT return embedded payload longer than the client-designated maximum.

The embedded content is a JSON Web Encryption as described in [Encrypting and Decrypting Files](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files).

#### Polling Manifest for Changes[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#polling-manifest-for-changes)

When the original QR includes the `L` flag for long-term use, the client MAY periodically poll for changes in the manifest. The server MAY provide a [`Retry-After`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After) header on successful manifest responses, indicating the minimum time that the client SHOULD wait before its next polling request. If manifest requests are issued too frequently, the server MAY respond with HTTP status 
```
429 Too Many
Requests
```
 and a `Retry-After` header indicating the minimum time that a client SHALL wait before re-issuing a manifest request.

INFO

**📓 Design Note: Rate Limiting**

More detailed guidance on polling will require real-world implementation experience. The current guidance provides the client a hint about how often to poll, and provides a way to convey that requests are being issued too frequently. We encourage implementers to experiment with additional capabilities.

#### Example SMART Health Link Manifest File[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#example-smart-health-link-manifest-file)

```
{
  "status": "finalized",
  "files": [{
    "contentType": "application/smart-health-card",
    "location": "https://bucket.cloud.example.org/file1?sas=MFXK6jL3oL3SI_lRfi_-cEfzIs5oHs6rRWmrsCAFzvk"
  }, 
  {
    "contentType": "application/smart-health-card",
    "embedded": "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..8zH0NmUXGwMOqEya.xdGRpgyvE9vNoKzHlr4itKKW2vo<snipped>"
  },
  {
    "contentType": "application/fhir+json;fhirVersion=4.0.1",
    "location": "https://bucket.cloud.example.org/file2?sas=T34xzj1XtqTYb2lzcgj59XCY4I6vLN3AwrTUIT9GuSc",
    "lastUpdated": "2025-03-09T15:29:46Z"
  }]
}
```

#### SMART Health Link Direct File Request (with `U` Flag)[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#smart-health-link-direct-file-request-with-u-flag)

When the `U` flag is present, the SMART Health Links Receiving Application SHALL NOT make a request for the manifest. Instead, the application SHALL retrieve a SMART Health Link's sole encrypted file by issuing a request to the `url` with:

*   Method: `GET`
    *   Query parameters 
        *   `recipient`: Required. A string describing the recipient (e.g.,the name of an organization or person) suitable for display to the Data Sharer

### Encrypting and Decrypting Files[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#encrypting-and-decrypting-files)

SMART Health Link files are always symmetrically encrypted with a SMART Health Links-specific key. Encryption is performed using JSON Web Encryption (JOSE JWE) compact serialization with `"alg": "dir"`, `"enc": "A256GCM"`, and a `cty` header indicating the content type of the payload (e.g., `application/smart-health-card`, `application/fhir+json`, etc).

The JWE MAY include a `zip` header with the value `DEF` to indicate that the plaintext of the JWE is compressed using the DEFLATE algorithm as specified in RFC 1951, before being encrypted. (Note, this indicates "raw" DEFLATE compression, omitting any zlib headers.)

Because the same encryption key is used for all files over time within a SMART Health Link, the SHL Sharing Application SHALL ensure a unique nonce (also known as initialization vector, or IV) for each encryption operation, including initial encryption of each file and every subsequent update.

#### Example Encryption[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#example-encryption)

```
import * as jose from 'https://deno.land/x/jose@v4.7.0/index.ts'
import * as pako from 'https://deno.land/x/pako@v2.0.3/pako.js'

const exampleShcFromWeb = await fetch("https://spec.smarthealth.cards/examples/example-00-e-file.smart-health-card");
const exampleShcBody = new Uint8Array(await exampleShcFromWeb.arrayBuffer());
const exampleContentType = 'application/smart-health-card'

const shlinkPayload =  {
  "key": "rxTgYlOaKJPFtcEd0qcceN8wEU4p94SqAwIWQe6uX7Q",
  // other properties omitted; not relevant for this example
};

const encrypted = await new jose
  .CompactEncrypt(new Uint8Array(exampleShcBody))
  .setProtectedHeader({
    alg: 'dir',
    enc: 'A256GCM',
    cty: exampleContentType,
  })
  .encrypt(jose.base64url.decode(shlinkPayload.key));

console.log(encrypted)
//eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwiY3R5IjoiYXBwbGljYXRpb24vc21hcnQtaGVhbHRoLWNhcmQifQ..B9Bd5AW751az-gEx.iah6mxLb5TQe2ZfCwEUs4R1t8WoP0mnFc-TUzN1NIyzUeDwJNOcxv4CY8wV6ys4Dicnr3IhqTvVU1RbR-4eq1GCd4g96faV8_0MbHwXzP246Tz9BDLhQ2zlAjYqvvCi_JuWdyWqGhKeWGX1XibNHFzzVT0FmYensfKF4o0uSeZWQDKVEEhzMSKuALMpUkfwHcmCRfLT-ctANSxq-Zj0IIeT66XbztOomStjlfi-F-FaqBGZfHOARCVvT143CTYELLJCUdD4qUVkrNuLmRZrNuqVpY0g5BjABswkIoDmyoRJAEohuZCamZNA--p-uRqJjRefED1eMrKSppabV2ugaqoFlieujTOE-a3VKib9aC-lFsmLalkwh9ctr_FZqS9H46rqGjGcOxtAXalo1jkMPGupVsE1W-xIH14wbPCYcgfldH9SH7X60462kxD8OFdHpvnnfAvjQnaE4QDqasT5ySpBRtck4GVxs2IRBt62-kOlzoI8lHapLdwIms-Gdt7z38E47ZE3afE4IIbobPGz7wGvjbi3z234ARvGQ4jREgPQb1NRYAEtZlrZNzR6N7ofXD8jF502tw-QWI_Ox0jFP5tynIiMp-hG25ecQ0s4MzPHFC0ZABPamgg3MS-UILl76gMDCHS5Te_JAXZoC1HnkETw5M217SaG5ISAU0F5qETMREfTjZR9E45MDhnw7uY1vo2lffRB3ei1QqGuLh0gUnVU7TUfFYwcOqV15sb0t1lMj0mmyG5v-_dE9H6dYtRKJARltmdfSmc1HisBewx75Xh5ChJQ1hiCEDaZ1wqFjsFJ6SrKgJ7C1N7vx6QKx8YXwFH7ePG2qG39leT5JKZnqAvi9fqc6x-YwfhSjbRKGZoj2o55Fd2fbwtK6CXpiW6AekT7PUcl_7ynTq-DaQ_Yc29WwtmgapcCRNpfcMsoqCD4giu1V3Sj5DQLglwuk1gAMcuV5fo8JpABu2_is83WZ_GJ1WWMUxyZGq6u-EGuZrP96Yewb7-zfnt2lao_LJg1ef5cqDTW7-0MS27wkmLiIi0e-PYvS-UfWVHg1oNbR-MHXMVEQ6gqNg08IgEyPDSFCUbf75HuMILN80bQNtSlFj6FR7uNKHr8sigvKI80k.5flOKKmeqYm0TamwROr8Nw
```

#### Example Decryption[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#example-decryption)

```
import * as jose from 'https://deno.land/x/jose@v4.7.0/index.ts'
import * as pako from 'https://deno.land/x/pako@v2.0.3/pako.js'

const shlinkPayload =  {
  "key": "rxTgYlOaKJPFtcEd0qcceN8wEU4p94SqAwIWQe6uX7Q",
  // other properties omitted; not relevant for this example
};

// Output from "encrypt" example above
const fileEncrypted = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwiY3R5IjoiYXBwbGljYXRpb24vc21hcnQtaGVhbHRoLWNhcmQifQ..B9Bd5AW751az-gEx.iah6mxLb5TQe2ZfCwEUs4R1t8WoP0mnFc-TUzN1NIyzUeDwJNOcxv4CY8wV6ys4Dicnr3IhqTvVU1RbR-4eq1GCd4g96faV8_0MbHwXzP246Tz9BDLhQ2zlAjYqvvCi_JuWdyWqGhKeWGX1XibNHFzzVT0FmYensfKF4o0uSeZWQDKVEEhzMSKuALMpUkfwHcmCRfLT-ctANSxq-Zj0IIeT66XbztOomStjlfi-F-FaqBGZfHOARCVvT143CTYELLJCUdD4qUVkrNuLmRZrNuqVpY0g5BjABswkIoDmyoRJAEohuZCamZNA--p-uRqJjRefED1eMrKSppabV2ugaqoFlieujTOE-a3VKib9aC-lFsmLalkwh9ctr_FZqS9H46rqGjGcOxtAXalo1jkMPGupVsE1W-xIH14wbPCYcgfldH9SH7X60462kxD8OFdHpvnnfAvjQnaE4QDqasT5ySpBRtck4GVxs2IRBt62-kOlzoI8lHapLdwIms-Gdt7z38E47ZE3afE4IIbobPGz7wGvjbi3z234ARvGQ4jREgPQb1NRYAEtZlrZNzR6N7ofXD8jF502tw-QWI_Ox0jFP5tynIiMp-hG25ecQ0s4MzPHFC0ZABPamgg3MS-UILl76gMDCHS5Te_JAXZoC1HnkETw5M217SaG5ISAU0F5qETMREfTjZR9E45MDhnw7uY1vo2lffRB3ei1QqGuLh0gUnVU7TUfFYwcOqV15sb0t1lMj0mmyG5v-_dE9H6dYtRKJARltmdfSmc1HisBewx75Xh5ChJQ1hiCEDaZ1wqFjsFJ6SrKgJ7C1N7vx6QKx8YXwFH7ePG2qG39leT5JKZnqAvi9fqc6x-YwfhSjbRKGZoj2o55Fd2fbwtK6CXpiW6AekT7PUcl_7ynTq-DaQ_Yc29WwtmgapcCRNpfcMsoqCD4giu1V3Sj5DQLglwuk1gAMcuV5fo8JpABu2_is83WZ_GJ1WWMUxyZGq6u-EGuZrP96Yewb7-zfnt2lao_LJg1ef5cqDTW7-0MS27wkmLiIi0e-PYvS-UfWVHg1oNbR-MHXMVEQ6gqNg08IgEyPDSFCUbf75HuMILN80bQNtSlFj6FR7uNKHr8sigvKI80k.5flOKKmeqYm0TamwROr8Nw"

const decrypted = await jose.compactDecrypt(
  fileEncrypted,
  jose.base64url.decode(shlinkPayload.key),
  {inflateRaw: async (bytes) => pako.inflateRaw(bytes)}
);

console.log(decrypted.protectedHeader.cty)
//application/smart-health-card

const decoded = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
/*
{
  verifiableCredential: [
    "eyJ6aXAiOiJERUYiLCJhbGciOiJFUzI1NiIsImtpZCI6IjNLZmRnLVh3UC03Z1h5eXd0VWZVQUR3QnVtRE9QS01ReC1pRUxMMTFX..."
  ]
}
*/
```

### Conformance and User-Facing Identification[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#conformance-and-user-facing-identification)

This core specification enables interoperable health information sharing via SMART Health Links and is designed for extensibility. Downstream profiles **MAY** add features like new extensions, flags, authentication methods, or cryptographic schemes.

However, such additions might require receiving applications to implement features beyond this core specification. To ensure a reliable baseline experience and protect the SMART Health Links brand, this specification defines _"Plain SMART Health Links"_ and ties the official URI scheme and branding to this definition.

Implementation Guides detailing SHLs that necessitate capabilities beyond this "Plain" baseline SHALL therefore adopt a distinct URI scheme and be registered on the [SMART Health Link Extensions Registry](https://confluence.hl7.org/spaces/FHIRI/pages/345088124/SMART+Health+Link+Extensions+Registry) for discoverability and to maintain brand integrity.

#### Plain SMART Health Link (Plain SHL)[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#plain-smart-health-link-plain-shl)

A _Plain SMART Health Link_ is one that allows a receiving application, implementing only this core specification (a "baseline client"), to successfully:

1.   Parse the SHL Payload.
2.   Retrieve the manifest or direct file.
3.   Retrieve and decrypt the content files.

Successful processing by a baseline client **SHALL NOT** depend on any protocols, algorithms, or extensions beyond those defined in this core specification. A baseline client must be able to access and decrypt the fundamental data, even if it ignores optional or unrecognized elements.

#### User-Facing Identification Requirements[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#user-facing-identification-requirements)

To maintain user trust and interoperability:

The `shlink:` URI scheme **SHALL** only be used for Plain SHLs. Links that are not Plain SHLs **SHALL** use a different URI scheme. The terms "SMART Health Link", "SMART Health Links", or the official logo **SHALL** only be used in user-facing contexts to identify Plain SHLs. Implementations presenting links that are not Plain SHLs **SHALL NOT** use this branding for those links.

This ensures users can reliably identify links guaranteed to work with any baseline receiving application. Extended implementations must use different schemes and branding to distinguish themselves. Downstream implementation guides defining non-Plain SHLs **SHALL** define their own unique URI scheme and declare it on the[HL7 Confluence page for SMART Health Link Extensions](https://confluence.hl7.org/display/FHIR/SMART+Health+Link+Extensions) with a reference to their downstream specification.

### Use Case Examples[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#use-case-examples)

INFO

**📓 Informative section**

The examples in this section are provided for informative purposes only and are not part of the formal SMART Health Links specification.

While the SMART Health Links spec focuses on providing access to structured data, it's often useful to share an interactive experience such as a web-based diagnostic portal where the SMART Health Links Receiving Application can review and add comments to a patient record. This can be accomplished in SMART Health Links with a manifest entry of type `application/fhir+json` that provides a [FHIR Endpoint resource](https://hl7.org/fhir/endpoint.html) with the following content:

**Endpoint element****Optionality****Type****Description**
name 1..1 string Describes the interactive experience with sufficient detail for the Receiving User to decide whether to engage
connectionType 1..1 CodeableConcept{"system": "https://smarthealthit.org",   
"code": "shl-interactive-experience"}
address 1..1 url The URI for the interactive experience
period 0..1 Period Optionally documents the window of time when the interactive experience is available

For example, the manifest for an SMART Health Links that offers the user the opportunity to "Review a case" might include a `application/fhir+json` entry with:

```
{
  "resourceType": "Endpoint",
  "status": "active",
  "name": "Review and comment on Alice's case in ACME Medical Diagnostic Portal",
  "address": "https://interact.example.org/case-id/521039c3-4bb9-45bd-8271-6001d2f4dea9",
  "period": {"end": "2022-10-20T12:30:00Z"},
  "connectionType": {"system": "https://smarthealthit.org", "code": "shl-interactive-experience"},
  "payloadType": [{"system": "http://terminology.hl7.org/CodeSystem/endpoint-payload-type", "code": "none"}],
}
```

Notes:

*   There is no perfect FHIR resource for documenting an interactive experience URL. `Endpoint` and `DocumentReference` are both plausible candidates, and we recommend `Endpoint` here because `DocumentReference` is designed for static payloads.
*   If the _only_ content being shared via SMART Health Links is a single interactive experience, implementers might consider sharing the interactive experience URL directly, instead of through SMART Health Links. However, since SMART Health Links provides a consistent pattern that users and tools can recognize, starting with SMART Health Links provides a foundation to support future expansion.

#### "Upgrading" from SMART Health Links to a Consumer-Mediated SMART on FHIR Connection[](https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html#upgrading-from-smart-health-links-to-a-consumer-mediated-smart-on-fhir-connection)

In addition to providing direct access to a pre-configured data set, SMART Health Linkss can include information to help establish a consumer-mediated SMART on FHIR connection to the data source. This can be accomplished with a SMART Health Links manifest entry of type `application/fhir+json` that provides a [FHIR Endpoint resource](https://hl7.org/fhir/endpoint.html) with the following content:

**Endpoint element****Optionality****Type****Description**
name 1..1 string Describes the SMART on FHIR endpoint with sufficient detail for the Receiving User to decide whether to connect
connectionType 1..1 CodeableConcept{"system": "http://terminology.hl7.org/CodeSystem/restful-security-service",   
"code": "SMART-on-FHIR"}
address 1..1 url The FHIR API base URL of the server that supports [SMART App Launch](http://hl7.org/fhir/smart-app-launch)

For example, the manifest for an SMART Health Links from Labs-R-Us might include a `application/fhir+json` entry with:

```
{
  "resourceType": "Endpoint",
  "status": "active",
  "name": "Labs-R-Us Application Access",
  "address": "https://fhir.example.org",
  "connectionType": {"system": "http://terminology.hl7.org/CodeSystem/restful-security-service", "code": "SMART-on-FHIR"},
  "payloadType": [{"system": "http://terminology.hl7.org/CodeSystem/endpoint-payload-type", "code": "none"}],
}
```

Notes:

*   Clients may need to pre-register with the SMART App Launch enabled service before they can request a connection. A client might compare `"address"` against an internal database to determine whether it can connect, retrieve `{address}/.well-known/smart-configuration` to determine whether the [Dynamic Client Registration Protocol](https://hl7.org/fhir/smart-app-launch/app-launch.html#register-app-with-ehr) is available or come up with another way to determine connectivity in order to inform the user of how they can act on the SMART Health Links.

*   This capability will only work in cases where the user receiving the SMART Health Links is authorized to approve SMART App Launch requests; other recipients might see the Endpoint but would be unable to complete a SMART App Launch
