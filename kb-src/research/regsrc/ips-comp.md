Title: International Patient Summary Implementation Guide v2.0.1

URL Source: https://hl7.org/fhir/uv/ips/StructureDefinition-Composition-uv-ips.html

Markdown Content:
International Patient Summary Implementation Guide
2.0.1 - STU 2 

Home
Table of Contents
General Principles and Design 
The "IPS"
FHIR Artifacts 
Support 
Change Log
Table of ContentsArtifacts SummaryComposition (IPS)

This page is part of the International Patient Summary Implementation Guide (v2.0.1: STU 2) based on FHIR (HL7® FHIR® Standard) R4. This is the current published version. For a full list of available versions, see the Directory of published versions

Content
Detailed Descriptions
Mappings
Examples
XML
JSON
TTL
Resource Profile: Composition (IPS) 
Official URL: http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips	Version: 2.0.1	
Standards status: Trial-use	Maturity Level: 3	Computable Name: CompositionUvIps


Copyright/Legal: HL7 International

Clinical document used to represent the International Patient Summary (IPS) data set. An International Patient Summary (IPS) document is an electronic health record extract containing essential healthcare information about a subject of care. The IPS dataset is minimal and non-exhaustive; specialty-agnostic and condition-independent; but still clinically relevant. As specified in ISO 27269, it is designed for supporting the use case scenario for ‘unplanned, cross border care’, but it is not limited to it. It is intended to be international, i.e., to provide generic solutions for global application beyond a particular region or country.

In this version of the guide the Medication Summary is expressed as a list of MedicationStatements or MedicationRequests. More information on medications lists are included in the Design Conventions and Principles page.

STU implementers are encouraged to provide their feedback about this design choice.

Usages:

Use this Profile: Bundle (IPS)
Refer to this Profile: Composition (IPS)
Examples for this Profile: Composition/composition-minimal
CapabilityStatements using this Profile: IPS Server Capability Statement

You can also check for usages in the FHIR IG Statistics

Formal Views of Profile Content

Description Differentials, Snapshots, and other representations.

Key Elements Table
Differential Table
Snapshot Table
Obligations
Statistics/References
All
Name	Flags	Card.	Type	Description & Constraints    Filter:  

 Composition		0..*	Composition(4.0.1)	International Patient Summary composition

 meta	Σ	0..1	Meta	Metadata about the resource
 profile	SOΣ	0..*	canonical(StructureDefinition)	The conformance of this Composition to a specific IPS version.

Obligations	Actor
MAY:able-to-populate	Creator (IPS)

 implicitRules	?!Σ	0..1	uri	A set of rules under which this content was created
 text	SO	0..1	Narrative	Text summary of the resource, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 modifierExtension	?!	0..*	Extension	Extensions that cannot be ignored
Constraints: ext-1

 identifier	SOΣ	0..1	Identifier	Version-independent identifier for the Composition
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)

 status	?!SOΣ	1..1	code	preliminary | final | amended | entered-in-error
Binding: CompositionStatus (required): The workflow/clinical status of the composition.
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 type	SOΣ	1..1	CodeableConceptIPS(2.0.1)	Kind of composition ("Patient Summary")
Binding: FHIRDocumentTypeCodes (preferred): Type of a composition.
Required Pattern: At least the following
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)

 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 60591-5
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 subject	SOΣ	1..1	Reference(Patient (IPS)(2.0.1))	Who and/or what the composition is about
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 reference	SOΣC	1..1	string	Literal reference, Relative, internal or absolute URL
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)

 date	SOΣ	1..1	dateTime	Composition editing time
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 author	SOΣ	1..*	Reference(Practitioner | PractitionerRole | Device | Patient | RelatedPerson | Organization)	Who and/or what authored the IPS

Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 title	SOΣ	1..1	string	The title of this patient summary. This may include information like the patient name and time generated
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 attester	SO	0..*	BackboneElement	Attests to accuracy of composition

Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 mode	SO	1..1	code	personal | professional | legal | official
Binding: CompositionAttestationMode (required): The way in which a person authenticated a composition.
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 time	SO	0..1	dateTime	When the composition was attested
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 party	SO	0..1	Reference(Patient | RelatedPerson | Practitioner | PractitionerRole | Organization)	Who attested the composition
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 custodian	SOΣ	0..1	Reference(Organization)	Organization which maintains the composition
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for event	Σ	0..*	BackboneElement	The clinical service(s) being documented
Slice: Unordered, Open by value:code

 event:All Slices				Content/Rules for all slices
 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 event:careProvisioningEvent	SOΣ	0..1	BackboneElement	The care provisioning being documented

Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 code	SOΣ	1..1	CodeableConcept	Code(s) that apply to the event being documented
Binding: ActCode (3.0.0) (example): This list of codes represents the main clinical acts being documented.

Required Pattern: At least the following
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://terminology.hl7.org/CodeSystem/v3-ActClass
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: PCPR
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 period	SOΣ	0..1	Period	The period covered by the documentation
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for section	SOC	3..*	BackboneElement	Sections composing the IPS
Slice: Unordered, Open by value:code
Constraints: cmp-1, cmp-2

Obligations	Actor
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:All Slices				Content/Rules for all slices
 Slices for extension		0..*	Extension	Extension
Slice: Unordered, Open by value:url
Constraints: ext-1

 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	SO	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Obligations	Actor
SHALL:handle	Consumer (IPS)

 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionProblems	SOC	1..1	BackboneElement	IPS Problems Section
Constraints: cmp-1, cmp-2, ips-comp-1

Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 11450-4
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Condition | DocumentReference)	Clinical problems or conditions currently being monitored for the patient.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:problem	SOC	0..*	Reference(Condition (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHALL:able-to-populate	Creator (IPS)
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 emptyReason	SOC	0..1	CodeableConcept	Why the section is empty
Binding: ListEmptyReasons (preferred): If a section is empty, why it is empty.
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionAllergies	SOC	1..1	BackboneElement	IPS Allergies and Intolerances Section
Constraints: cmp-1, cmp-2, ips-comp-1

Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 48765-2
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(AllergyIntolerance | DocumentReference)	Relevant allergies or intolerances for that patient.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:allergyOrIntolerance	SOC	0..*	Reference(AllergyIntolerance (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHALL:able-to-populate	Creator (IPS)
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 emptyReason	SOC	0..1	CodeableConcept	Why the section is empty
Binding: ListEmptyReasons (preferred): If a section is empty, why it is empty.
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionMedications	SOC	1..1	BackboneElement	IPS Medication Summary Section
Constraints: cmp-1, cmp-2, ips-comp-1

Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 10160-0
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(MedicationStatement | MedicationRequest | MedicationAdministration | MedicationDispense | DocumentReference)	Medications relevant for the scope of the patient summary
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:medicationStatementOrRequest	SOC	0..*	Reference(MedicationStatement (IPS)(2.0.1) | MedicationRequest (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHALL:able-to-populate	Creator (IPS)
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 emptyReason	SOC	0..1	CodeableConcept	Why the section is empty
Binding: ListEmptyReasons (preferred): If a section is empty, why it is empty.
Obligations	Actor
SHALL:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionImmunizations	SOC	0..1	BackboneElement	IPS Immunizations Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 11369-6
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Immunization | DocumentReference)	Patient's immunization status and pertinent history.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:immunization	SOC	0..*	Reference(Immunization (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionResults	SOC	0..1	BackboneElement	IPS Results Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 30954-2
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Observation | DiagnosticReport | DocumentReference)	Relevant observation results collected on the patient or produced on in-vitro biologic specimens collected from the patient.
Slice: Unordered, Open by type:resolve(), profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:results-observation-laboratory-pathology	SOC	0..*	Reference(Observation Results - Laboratory/Pathology (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 entry:results-observation-radiology	SOC	0..*	Reference(Observation Results - Radiology (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 entry:results-diagnosticReport	SOC	0..*	Reference(DiagnosticReport (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionProceduresHx	SOC	0..1	BackboneElement	IPS History of Procedures Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 47519-4
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Procedure | DocumentReference)	Patient past procedures pertinent to the scope of this document.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:procedure	SOC	0..*	Reference(Procedure (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionMedicalDevices	SOC	0..1	BackboneElement	IPS Medical Devices Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 46264-8
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(DeviceUseStatement | DocumentReference)	Patient history of medical device use.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:deviceStatement	SOC	0..*	Reference(DeviceUseStatement (IPS)(2.0.1))	A reference to data that supports this section

Obligations	Actor
SHOULD:populate-if-known	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 section:sectionAdvanceDirectives	SOC	0..1	BackboneElement	IPS Advance Directives Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 42348-3
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Consent | DocumentReference)	Narrative description of the patient's advance directive.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:advanceDirectivesConsent	C	0..*	Reference(Consent)	A reference to data that supports this section

 section:sectionAlerts	SOC	0..1	BackboneElement	IPS Alerts Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 104605-1
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Flag | DocumentReference)	Alert information.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:alertsFlag	C	0..*	Reference(Flag - Alert (IPS)(2.0.1))	A reference to data that supports this section

 section:sectionFunctionalStatus	SOC	0..1	BackboneElement	IPS Functional Status
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 47420-5
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Condition | ClinicalImpression | DocumentReference)	Optional entry used to represent disabilities and functional assessments
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:disability	C	0..*	Reference(Condition (IPS)(2.0.1))	A reference to data that supports this section

 entry:functionalAssessment	C	0..*	Reference(ClinicalImpression)	A reference to data that supports this section

 section:sectionPastProblems	SOC	0..1	BackboneElement	IPS History of Past Problems Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 11348-0
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Condition | DocumentReference)	Conditions the patient suffered in the past.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:pastProblem	C	0..*	Reference(Condition (IPS)(2.0.1))	A reference to data that supports this section

 section:sectionPregnancyHx	SOC	0..1	BackboneElement	IPS History of Pregnancy Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 10162-6
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Observation | DocumentReference)	Current pregnancy status and, optionally, information about the outcome of earlier pregnancies.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:pregnancyStatus	C	0..*	Reference(Observation Pregnancy - Status (IPS)(2.0.1))	A reference to data that supports this section

 entry:pregnancyOutcome	C	0..*	Reference(Observation Pregnancy - Outcome (IPS)(2.0.1))	A reference to data that supports this section

 section:sectionPatientStory	SOC	0..1	BackboneElement	IPS Patient Story Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 81338-6
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 entry	C	0..*	Reference(Resource)	Patient Story resources.

 section:sectionPlanOfCare	SOC	0..1	BackboneElement	IPS Plan of Care Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 18776-5
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(CarePlan | ImmunizationRecommendation | DocumentReference)	Optional entry used to represent structured care plans
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:carePlan	C	0..*	Reference(CarePlan)	A reference to data that supports this section

 entry:immunizationRecommendation	C	0..*	Reference(ImmunizationRecommendation)	A reference to data that supports this section

 section:sectionSocialHistory	SOC	0..1	BackboneElement	IPS Social History Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 29762-2
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Observation | DocumentReference)	Health related "lifestyle factors" or "lifestyle observations" (e.g. smoke habits; alcohol consumption; diets, risky habits.)
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:smokingTobaccoUse	C	0..1	Reference(Observation Social History - Tobacco Use (IPS)(2.0.1))	A reference to data that supports this section

 entry:alcoholUse	C	0..1	Reference(Observation Social History - Alcohol Use (IPS)(2.0.1))	A reference to data that supports this section

 section:sectionVitalSigns	SOC	0..1	BackboneElement	IPS Vital Signs Section
Constraints: cmp-1, cmp-2

Obligations	Actor
SHOULD:display	Consumer (IPS)
SHALL:handle	Consumer (IPS)

 Slices for extension				Content/Rules for all slices
 extension:section-note		0..*	Annotation	Additional notes that apply to the section (but not to specific resource).
URL: http://hl7.org/fhir/StructureDefinition/note
Constraints: ext-1

 modifierExtension	?!Σ	0..*	Extension	Extensions that cannot be ignored even if unrecognized
Constraints: ext-1

 title	SO	1..1	string	Label for section (e.g. for ToC)
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 code	S	1..1	CodeableConcept	Classification of section (recommended)
Binding: DocumentSectionCodes (example): Classification of a section of a composition/document.
Required Pattern: At least the following
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 coding		1..*	Coding	Code defined by a terminology system
Fixed Value: (Complex)
 id		0..1	string	Unique id for inter-element referencing
 extension		0..*	Extension	Additional content defined by implementations
 system		1..1	uri	Identity of the terminology system
Fixed Value: http://loinc.org
 version		0..1	string	Version of the system - if relevant
 code		1..1	code	Symbol in syntax defined by the system
Fixed Value: 8716-3
 display		0..1	string	Representation defined by the system
 userSelected		0..1	boolean	If this coding was chosen directly by the user
 text		0..1	string	Plain text representation of the concept
 text	SOC	1..1	Narrative	Text summary of the section, for human interpretation
This profile does not constrain the narrative in regard to content, language, or traceability to data elements
Obligations	Actor
SHALL:populate	Creator (IPS)
SHALL:handle	Consumer (IPS)
SHOULD:display	Consumer (IPS)

 Slices for entry	C	0..*	Reference(Observation | DocumentReference)	Notable vital signs or physical findings.
Slice: Unordered, Open by profile:resolve()

 Slices for entry				Content/Rules for all slices
 entry:vitalSign	C	0..*	Reference(Vital Signs Profile)	A reference to data that supports this section


 Documentation for this format
Name	Consumer (IPS)	Creator (IPS)

 Composition		
 meta		
 profile		
MAY:able-to-populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 identifier	
SHALL:handle
	
SHALL:populate-if-known

 status	
SHALL:handle
SHOULD:display
	
SHALL:populate

 type	
SHALL:handle
	
SHALL:populate

 subject	
SHALL:handle
SHOULD:display
	
SHALL:populate

 reference	
SHALL:handle
	
SHALL:populate

 date	
SHALL:handle
SHOULD:display
	
SHALL:populate

 author	
SHALL:handle
SHOULD:display
	
SHALL:populate

 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 attester	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 mode	
SHALL:handle
SHOULD:display
	
SHALL:populate

 time	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 party	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 custodian	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 Slices for event		
 event:careProvisioningEvent	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 code	
SHALL:handle
SHOULD:display
	
SHALL:populate

 period	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 Slices for section	
SHALL:handle
SHOULD:display
	
 section:All Slices		
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 code	
SHALL:handle
	
 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 section:sectionProblems	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:problem	
SHALL:handle
SHOULD:display
	
SHALL:able-to-populate
SHOULD:populate-if-known

 emptyReason	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 section:sectionAllergies	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:allergyOrIntolerance	
SHALL:handle
SHOULD:display
	
SHALL:able-to-populate
SHOULD:populate-if-known

 emptyReason	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 section:sectionMedications	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:medicationStatementOrRequest	
SHALL:handle
SHOULD:display
	
SHALL:able-to-populate
SHOULD:populate-if-known

 emptyReason	
SHALL:handle
SHOULD:display
	
SHALL:populate-if-known

 section:sectionImmunizations	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:immunization	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 section:sectionResults	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:results-observation-laboratory-pathology	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 entry:results-observation-radiology	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 entry:results-diagnosticReport	
SHALL:handle
SHOULD:display
	
 section:sectionProceduresHx	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:procedure	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 section:sectionMedicalDevices	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 entry:deviceStatement	
SHALL:handle
SHOULD:display
	
SHOULD:populate-if-known

 section:sectionAdvanceDirectives	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionAlerts	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionFunctionalStatus	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionPastProblems	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionPregnancyHx	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionPatientStory	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 section:sectionPlanOfCare	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionSocialHistory	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		
 section:sectionVitalSigns	
SHOULD:display
SHALL:handle
	
 Slices for extension		
 title	
SHALL:handle
SHOULD:display
	
SHALL:populate

 text	
SHALL:handle
SHOULD:display
	
SHALL:populate

 Slices for entry		

 Documentation for this format
Terminology Bindings
Path	Status	Usage	ValueSet	Version	Source
Composition.status	Base	required	CompositionStatus 	📍4.0.1	FHIR Std.
Composition.type	Base	preferred	FHIR Document Type Codes 	📍4.0.1	FHIR Std.
Composition.attester.​mode	Base	required	CompositionAttestationMode 	📍4.0.1	FHIR Std.
Composition.event:careProvisioningEvent.​code	Base	example	v3 Code System ActCode 	📍3.0.0	THO v7.2
Composition.section.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionProblems.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionProblems.​emptyReason	Base	preferred	List Empty Reasons 	📍4.0.1	FHIR Std.
Composition.section:sectionAllergies.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionAllergies.​emptyReason	Base	preferred	List Empty Reasons 	📍4.0.1	FHIR Std.
Composition.section:sectionMedications.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionMedications.​emptyReason	Base	preferred	List Empty Reasons 	📍4.0.1	FHIR Std.
Composition.section:sectionImmunizations.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionResults.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionProceduresHx.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionMedicalDevices.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionAdvanceDirectives.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionAlerts.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionFunctionalStatus.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionPastProblems.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionPregnancyHx.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionPatientStory.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionPlanOfCare.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionSocialHistory.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Composition.section:sectionVitalSigns.​code	Base	example	Document Section Codes 	📍4.0.1	FHIR Std.
Constraints
Id	Grade	Path(s)	Description	Expression
cmp-1	error	Composition.section, Composition.section:sectionProblems, Composition.section:sectionAllergies, Composition.section:sectionMedications, Composition.section:sectionImmunizations, Composition.section:sectionResults, Composition.section:sectionProceduresHx, Composition.section:sectionMedicalDevices, Composition.section:sectionAdvanceDirectives, Composition.section:sectionAlerts, Composition.section:sectionFunctionalStatus, Composition.section:sectionPastProblems, Composition.section:sectionPregnancyHx, Composition.section:sectionPatientStory, Composition.section:sectionPlanOfCare, Composition.section:sectionSocialHistory, Composition.section:sectionVitalSigns	A section must contain at least one of text, entries, or sub-sections	text.exists() or entry.exists() or section.exists()
cmp-2	error	Composition.section, Composition.section:sectionProblems, Composition.section:sectionAllergies, Composition.section:sectionMedications, Composition.section:sectionImmunizations, Composition.section:sectionResults, Composition.section:sectionProceduresHx, Composition.section:sectionMedicalDevices, Composition.section:sectionAdvanceDirectives, Composition.section:sectionAlerts, Composition.section:sectionFunctionalStatus, Composition.section:sectionPastProblems, Composition.section:sectionPregnancyHx, Composition.section:sectionPatientStory, Composition.section:sectionPlanOfCare, Composition.section:sectionSocialHistory, Composition.section:sectionVitalSigns	A section can only have an emptyReason if it is empty	emptyReason.empty() or entry.empty()
dom-2	error	Composition	If the resource is contained in another resource, it SHALL NOT contain nested Resources	contained.contained.empty()
dom-3	error	Composition	If the resource is contained in another resource, it SHALL be referred to from elsewhere in the resource or SHALL refer to the containing resource	contained.where((('#'+id in (%resource.descendants().reference | %resource.descendants().as(canonical) | %resource.descendants().as(uri) | %resource.descendants().as(url))) or descendants().where(reference = '#').exists() or descendants().where(as(canonical) = '#').exists() or descendants().where(as(canonical) = '#').exists()).not()).trace('unmatched', id).empty()
dom-4	error	Composition	If a resource is contained in another resource, it SHALL NOT have a meta.versionId or a meta.lastUpdated	contained.meta.versionId.empty() and contained.meta.lastUpdated.empty()
dom-5	error	Composition	If a resource is contained in another resource, it SHALL NOT have a security label	contained.meta.security.empty()
dom-6	best practice	Composition	A resource should have narrative for robust management	text.`div`.exists()
ele-1	error	Composition.meta, Composition.meta.profile, Composition.implicitRules, Composition.text, Composition.modifierExtension, Composition.identifier, Composition.status, Composition.type, Composition.subject, Composition.subject.reference, Composition.date, Composition.author, Composition.title, Composition.attester, Composition.attester.modifierExtension, Composition.attester.mode, Composition.attester.time, Composition.attester.party, Composition.custodian, Composition.event, Composition.event.modifierExtension, Composition.event:careProvisioningEvent, Composition.event:careProvisioningEvent.modifierExtension, Composition.event:careProvisioningEvent.code, Composition.event:careProvisioningEvent.period, Composition.section, Composition.section.extension, Composition.section.extension:section-note, Composition.section.modifierExtension, Composition.section.title, Composition.section.code, Composition.section.text, Composition.section:sectionProblems, Composition.section:sectionProblems.extension:section-note, Composition.section:sectionProblems.modifierExtension, Composition.section:sectionProblems.title, Composition.section:sectionProblems.code, Composition.section:sectionProblems.text, Composition.section:sectionProblems.entry, Composition.section:sectionProblems.entry:problem, Composition.section:sectionProblems.emptyReason, Composition.section:sectionAllergies, Composition.section:sectionAllergies.extension:section-note, Composition.section:sectionAllergies.modifierExtension, Composition.section:sectionAllergies.title, Composition.section:sectionAllergies.code, Composition.section:sectionAllergies.text, Composition.section:sectionAllergies.entry, Composition.section:sectionAllergies.entry:allergyOrIntolerance, Composition.section:sectionAllergies.emptyReason, Composition.section:sectionMedications, Composition.section:sectionMedications.extension:section-note, Composition.section:sectionMedications.modifierExtension, Composition.section:sectionMedications.title, Composition.section:sectionMedications.code, Composition.section:sectionMedications.text, Composition.section:sectionMedications.entry, Composition.section:sectionMedications.entry:medicationStatementOrRequest, Composition.section:sectionMedications.emptyReason, Composition.section:sectionImmunizations, Composition.section:sectionImmunizations.extension:section-note, Composition.section:sectionImmunizations.modifierExtension, Composition.section:sectionImmunizations.title, Composition.section:sectionImmunizations.code, Composition.section:sectionImmunizations.text, Composition.section:sectionImmunizations.entry, Composition.section:sectionImmunizations.entry:immunization, Composition.section:sectionResults, Composition.section:sectionResults.extension:section-note, Composition.section:sectionResults.modifierExtension, Composition.section:sectionResults.title, Composition.section:sectionResults.code, Composition.section:sectionResults.text, Composition.section:sectionResults.entry, Composition.section:sectionResults.entry:results-observation-laboratory-pathology, Composition.section:sectionResults.entry:results-observation-radiology, Composition.section:sectionResults.entry:results-diagnosticReport, Composition.section:sectionProceduresHx, Composition.section:sectionProceduresHx.extension:section-note, Composition.section:sectionProceduresHx.modifierExtension, Composition.section:sectionProceduresHx.title, Composition.section:sectionProceduresHx.code, Composition.section:sectionProceduresHx.text, Composition.section:sectionProceduresHx.entry, Composition.section:sectionProceduresHx.entry:procedure, Composition.section:sectionMedicalDevices, Composition.section:sectionMedicalDevices.extension:section-note, Composition.section:sectionMedicalDevices.modifierExtension, Composition.section:sectionMedicalDevices.title, Composition.section:sectionMedicalDevices.code, Composition.section:sectionMedicalDevices.text, Composition.section:sectionMedicalDevices.entry, Composition.section:sectionMedicalDevices.entry:deviceStatement, Composition.section:sectionAdvanceDirectives, Composition.section:sectionAdvanceDirectives.extension:section-note, Composition.section:sectionAdvanceDirectives.modifierExtension, Composition.section:sectionAdvanceDirectives.title, Composition.section:sectionAdvanceDirectives.code, Composition.section:sectionAdvanceDirectives.text, Composition.section:sectionAdvanceDirectives.entry, Composition.section:sectionAdvanceDirectives.entry:advanceDirectivesConsent, Composition.section:sectionAlerts, Composition.section:sectionAlerts.extension:section-note, Composition.section:sectionAlerts.modifierExtension, Composition.section:sectionAlerts.title, Composition.section:sectionAlerts.code, Composition.section:sectionAlerts.text, Composition.section:sectionAlerts.entry, Composition.section:sectionAlerts.entry:alertsFlag, Composition.section:sectionFunctionalStatus, Composition.section:sectionFunctionalStatus.extension:section-note, Composition.section:sectionFunctionalStatus.modifierExtension, Composition.section:sectionFunctionalStatus.title, Composition.section:sectionFunctionalStatus.code, Composition.section:sectionFunctionalStatus.text, Composition.section:sectionFunctionalStatus.entry, Composition.section:sectionFunctionalStatus.entry:disability, Composition.section:sectionFunctionalStatus.entry:functionalAssessment, Composition.section:sectionPastProblems, Composition.section:sectionPastProblems.extension:section-note, Composition.section:sectionPastProblems.modifierExtension, Composition.section:sectionPastProblems.title, Composition.section:sectionPastProblems.code, Composition.section:sectionPastProblems.text, Composition.section:sectionPastProblems.entry, Composition.section:sectionPastProblems.entry:pastProblem, Composition.section:sectionPregnancyHx, Composition.section:sectionPregnancyHx.extension:section-note, Composition.section:sectionPregnancyHx.modifierExtension, Composition.section:sectionPregnancyHx.title, Composition.section:sectionPregnancyHx.code, Composition.section:sectionPregnancyHx.text, Composition.section:sectionPregnancyHx.entry, Composition.section:sectionPregnancyHx.entry:pregnancyStatus, Composition.section:sectionPregnancyHx.entry:pregnancyOutcome, Composition.section:sectionPatientStory, Composition.section:sectionPatientStory.extension:section-note, Composition.section:sectionPatientStory.modifierExtension, Composition.section:sectionPatientStory.title, Composition.section:sectionPatientStory.code, Composition.section:sectionPatientStory.text, Composition.section:sectionPatientStory.entry, Composition.section:sectionPlanOfCare, Composition.section:sectionPlanOfCare.extension:section-note, Composition.section:sectionPlanOfCare.modifierExtension, Composition.section:sectionPlanOfCare.title, Composition.section:sectionPlanOfCare.code, Composition.section:sectionPlanOfCare.text, Composition.section:sectionPlanOfCare.entry, Composition.section:sectionPlanOfCare.entry:carePlan, Composition.section:sectionPlanOfCare.entry:immunizationRecommendation, Composition.section:sectionSocialHistory, Composition.section:sectionSocialHistory.extension:section-note, Composition.section:sectionSocialHistory.modifierExtension, Composition.section:sectionSocialHistory.title, Composition.section:sectionSocialHistory.code, Composition.section:sectionSocialHistory.text, Composition.section:sectionSocialHistory.entry, Composition.section:sectionSocialHistory.entry:smokingTobaccoUse, Composition.section:sectionSocialHistory.entry:alcoholUse, Composition.section:sectionVitalSigns, Composition.section:sectionVitalSigns.extension:section-note, Composition.section:sectionVitalSigns.modifierExtension, Composition.section:sectionVitalSigns.title, Composition.section:sectionVitalSigns.code, Composition.section:sectionVitalSigns.text, Composition.section:sectionVitalSigns.entry, Composition.section:sectionVitalSigns.entry:vitalSign	All FHIR elements must have a @value or children	hasValue() or (children().count() > id.count())
ext-1	error	Composition.modifierExtension, Composition.attester.modifierExtension, Composition.event.modifierExtension, Composition.event:careProvisioningEvent.modifierExtension, Composition.section.extension, Composition.section.extension:section-note, Composition.section.modifierExtension, Composition.section:sectionProblems.extension:section-note, Composition.section:sectionProblems.modifierExtension, Composition.section:sectionAllergies.extension:section-note, Composition.section:sectionAllergies.modifierExtension, Composition.section:sectionMedications.extension:section-note, Composition.section:sectionMedications.modifierExtension, Composition.section:sectionImmunizations.extension:section-note, Composition.section:sectionImmunizations.modifierExtension, Composition.section:sectionResults.extension:section-note, Composition.section:sectionResults.modifierExtension, Composition.section:sectionProceduresHx.extension:section-note, Composition.section:sectionProceduresHx.modifierExtension, Composition.section:sectionMedicalDevices.extension:section-note, Composition.section:sectionMedicalDevices.modifierExtension, Composition.section:sectionAdvanceDirectives.extension:section-note, Composition.section:sectionAdvanceDirectives.modifierExtension, Composition.section:sectionAlerts.extension:section-note, Composition.section:sectionAlerts.modifierExtension, Composition.section:sectionFunctionalStatus.extension:section-note, Composition.section:sectionFunctionalStatus.modifierExtension, Composition.section:sectionPastProblems.extension:section-note, Composition.section:sectionPastProblems.modifierExtension, Composition.section:sectionPregnancyHx.extension:section-note, Composition.section:sectionPregnancyHx.modifierExtension, Composition.section:sectionPatientStory.extension:section-note, Composition.section:sectionPatientStory.modifierExtension, Composition.section:sectionPlanOfCare.extension:section-note, Composition.section:sectionPlanOfCare.modifierExtension, Composition.section:sectionSocialHistory.extension:section-note, Composition.section:sectionSocialHistory.modifierExtension, Composition.section:sectionVitalSigns.extension:section-note, Composition.section:sectionVitalSigns.modifierExtension	Must have either extensions or value[x], not both	extension.exists() != value.exists()
ips-comp-1	error	Composition.section:sectionProblems, Composition.section:sectionAllergies, Composition.section:sectionMedications	Either section.entry or emptyReason are present	(entry.reference.exists() or emptyReason.exists())

 

Other representations of profile: CSV, Excel, Schematron

IG © 2020+ HL7 International / Patient Care. Package hl7.fhir.uv.ips#2.0.1 based on FHIR 4.0.1. Generated 2026-06-19
Links: Table of Contents | QA Report | Version History |  | Propose a change
