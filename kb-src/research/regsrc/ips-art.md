Title: International Patient Summary Implementation Guide v2.0.1

URL Source: https://hl7.org/fhir/uv/ips/artifacts.html

Markdown Content:
This page provides a list of the FHIR artifacts defined as part of this implementation guide.

### Requirements: Actor Definitions [](https://hl7.org/fhir/uv/ips/artifacts.html#requirements-actor-definitions)

The following artifacts define the types of individuals and/or systems that will interact as part of the use cases covered by this implementation guide.

[Consumer (IPS)](https://hl7.org/fhir/uv/ips/en/ActorDefinition-Consumer.html "ActorDefinition/Consumer")An IPS Consumer actor is a system that receives an IPS document and uses the content of this document.
[Creator (IPS)](https://hl7.org/fhir/uv/ips/en/ActorDefinition-Creator.html "ActorDefinition/Creator")An IPS Creator actor is a system which produces/assembles/creates an IPS document.
[Server (IPS)](https://hl7.org/fhir/uv/ips/en/ActorDefinition-Server.html "ActorDefinition/Server")An IPS Server is a FHIR server acting as an [IPS Creator](https://hl7.org/fhir/uv/ips/en/ActorDefinition-Creator.html) by providing conformant IPS documents in response to FHIR API requests.

### Behavior: Capability Statements [](https://hl7.org/fhir/uv/ips/artifacts.html#behavior-capability-statements)

The following artifacts define the specific capabilities that different types of systems are expected to have in order to comply with this implementation guide. Systems conforming to this implementation guide are expected to declare conformance to one or more of the following capability statements.

[IPS Server Capability Statement](https://hl7.org/fhir/uv/ips/en/CapabilityStatement-ips-server.html "CapabilityStatement/ips-server")This CapabilityStatement describes the expected capabilities of the IPS Server actor which is responsible for providing responses to the queries submitted for IPS documents. The list of FHIR profiles and operations supported by IPS Servers are defined in this CapabilityStatement.

### Behavior: Operation Definitions [](https://hl7.org/fhir/uv/ips/artifacts.html#behavior-operation-definitions)

These are custom operations that can be supported by and/or invoked by systems conforming to this implementation guide.

[IPS Summary](https://hl7.org/fhir/uv/ips/en/OperationDefinition-summary.html "OperationDefinition/summary")This operation is used to return a patient summary using the IPS profile.

### Structures: Logical Models [](https://hl7.org/fhir/uv/ips/artifacts.html#structures-logical-models)

These define data models that represent the domain covered by this implementation guide in more business-friendly terms than the underlying FHIR resources.

[Document](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Document.html "StructureDefinition/Document")Abstract model of an IPS document ("Document" mapping target)
[DocumentSection](https://hl7.org/fhir/uv/ips/en/StructureDefinition-DocumentSection.html "StructureDefinition/DocumentSection")Abstract model of an IPS section ("DocumentSection" mapping target)
[International Patient Summary Sections - Logical Model](https://hl7.org/fhir/uv/ips/en/StructureDefinition-IPSSectionsLM.html "StructureDefinition/IPSSectionsLM")International Patient Summary Sections - Logical Model

### Structures: Resource Profiles [](https://hl7.org/fhir/uv/ips/artifacts.html#structures-resource-profiles)

These define constraints on FHIR resources for systems conforming to this implementation guide.

[AllergyIntolerance (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-AllergyIntolerance-uv-ips.html "StructureDefinition/AllergyIntolerance-uv-ips")This profile represents the constraints applied to the AllergyIntolerance resource by the International Patient Summary (IPS) FHIR Implementation Guide. A record of an allergy or intolerance is represented in the patient summary as an instance of an AllergyIntolerance resource constrained by this profile.

It documents the relevant allergies or intolerances for a patient, describing the kind of reaction (e.g. rash, anaphylaxis,..); preferably the agents that cause it; and optionally the criticality and the certainty of the allergy.
[Bundle (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Bundle-uv-ips.html "StructureDefinition/Bundle-uv-ips")This profile represents the constraints applied to the Bundle resource by the International Patient Summary (IPS) FHIR Implementation Guide.
[Composition (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Composition-uv-ips.html "StructureDefinition/Composition-uv-ips")Clinical document used to represent the International Patient Summary (IPS) data set. An International Patient Summary (IPS) document is an electronic health record extract containing essential healthcare information about a subject of care. The IPS dataset is minimal and non-exhaustive; specialty-agnostic and condition-independent; but still clinically relevant. As specified in ISO 27269, it is designed for supporting the use case scenario for ‘unplanned, cross border care’, but it is not limited to it. It is intended to be international, i.e., to provide generic solutions for global application beyond a particular region or country.
[Condition (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Condition-uv-ips.html "StructureDefinition/Condition-uv-ips")This profile represents the constraints applied to the Condition resource by the International Patient Summary (IPS) FHIR Implementation Guide. A record of a problem is represented in the patient summary as an instance of the Condition resource constrained by this profile.
[Device (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Device-uv-ips.html "StructureDefinition/Device-uv-ips")This profile represents the constraints applied to the Device resource by the International Patient Summary (IPS) FHIR Implementation Guide, based on FHIR R4. A device used by or implanted on the patient is described in the patient summary as an instance of a Device resource constrained by this profile.
[Device - Performer or Observer (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Device-observer-uv-ips.html "StructureDefinition/Device-observer-uv-ips")This profile represents the constraints applied to the Device resource by the IPS project, which specifies an international patient summary based on the FHIR standard R4.

This profile describes a device that plays the role of observer or performer.
[DeviceUseStatement (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-DeviceUseStatement-uv-ips.html "StructureDefinition/DeviceUseStatement-uv-ips")This profile represents the constraints applied to the DeviceUseStatement resource by the International Patient Summary (IPS) FHIR Implementation Guide, based on FHIR R4. A statement about a device used by or implanted on the patient is described in the patient summary as an instance of a DeviceUseStatement resource constrained by this profile.
[DiagnosticReport (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-DiagnosticReport-uv-ips.html "StructureDefinition/DiagnosticReport-uv-ips")This profile constrains the DiagnosticReport resource to represent diagnostic test and procedure reports in a patient summary.
[Flag - Alert (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Flag-alert-uv-ips.html "StructureDefinition/Flag-alert-uv-ips")This profile constrains the Flag resource by the International Patient Summary (IPS) FHIR Implementation Guide. A record of an alert is represented in the patient summary as an instance of a Flag resource constrained by this profile.

This specialized Flag is used to convey information about an alert specific to an IPS. Information is flagged to raise awareness of potential concerns and/or dangers to/from the subject of the IPS. It brings information to the fore and may reference other information from the summary (through the supportingInfo extension) as well as present obstacles to care.
[ImagingStudy (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-ImagingStudy-uv-ips.html "StructureDefinition/ImagingStudy-uv-ips")This profile represents the constraints applied to the ImagingStudy resource by the IPS project, which specifies the information on a DICOM imaging study this imaging result is part of.
[Immunization (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Immunization-uv-ips.html "StructureDefinition/Immunization-uv-ips")This profile represents the constraints applied to the Immunization resource by the International Patient Summary (IPS) FHIR Implementation Guide. A record of an immunization is represented in the patient summary as an instance of an Immunization resource constrained by this profile.

It describes the event of a patient being administered a vaccination or a record of a vaccination as reported by a patient, a clinician or another party.
[Medication (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Medication-uv-ips.html "StructureDefinition/Medication-uv-ips")This profile represents the constraints applied to the Medication resource by the International Patient Summary (IPS) FHIR Implementation Guide, based on FHIR R4. A medication is described in the patient summary as an instance of a Medication resource constrained by this profile.
[MedicationRequest (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-MedicationRequest-uv-ips.html "StructureDefinition/MedicationRequest-uv-ips")This profile represents the constraints applied to the MedicationRequest resource by the International Patient Summary (IPS) FHIR Implementation Guide, based on FHIR R4. A record of a medication request is represented in the patient summary as an instance of a MedicationRequest resource constrained by this profile.
[MedicationStatement (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-MedicationStatement-uv-ips.html "StructureDefinition/MedicationStatement-uv-ips")This profile represents the constraints applied to the MedicationStatement resource by the International Patient Summary (IPS) FHIR Implementation Guide, based on FHIR R4. A record of a medication statement is represented in the patient summary as an instance of a MedicationStatement resource constrained by this profile.
[Observation Pregnancy - Expected Delivery Date (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-pregnancy-edd-uv-ips.html "StructureDefinition/Observation-pregnancy-edd-uv-ips")This profile constrains the Observation resource to represent the pregnancy expected delivery date (EDD).
[Observation Pregnancy - Outcome (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-pregnancy-outcome-uv-ips.html "StructureDefinition/Observation-pregnancy-outcome-uv-ips")This profile constrains the Observation resource to represent the summarized history of pregnancy outcomes.
[Observation Pregnancy - Status (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-pregnancy-status-uv-ips.html "StructureDefinition/Observation-pregnancy-status-uv-ips")This profile constrains the Observation resource to represent the pregnancy status.
[Observation Results - Laboratory/Pathology (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-results-laboratory-pathology-uv-ips.html "StructureDefinition/Observation-results-laboratory-pathology-uv-ips")This profile constrains the Observation resource to represent results produced by laboratory (including pathology) tests or panels/studies in a patient summary.

This observation may represent the result of a simple laboratory test such as hematocrit or it may group the set of results produced by a multi-test study or panel such as a complete blood count, a dynamic function test, or a urine specimen study. In the latter case, the observation carries the overall conclusion of the study and or a global interpretation by the producer of the study, in the comment element; and references the atomic results of the study as "has-member" child observations.
[Observation Results - Radiology (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-results-radiology-uv-ips.html "StructureDefinition/Observation-results-radiology-uv-ips")This profile represents the constraints applied to the Observation resource by the IPS project, which specifies a radiology observation for the international patient summary based on the FHIR standard R4.

This observation may represent the conclusions of a diagnostic procedure such a Chest RX, or it may group the set of results produced by that single or multi-modality procedure.

In the latter case, the main observation (this one) carries the overall conclusion of the study and/or a global interpretation by the observer of the study as value of this observation; and may reference the atomic results of the study as "child observations".

It allows also providing details about the related study using the partOf element referring to an ImagingStudy resource.
[Observation Social History - Alcohol Use (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-alcoholuse-uv-ips.html "StructureDefinition/Observation-alcoholuse-uv-ips")This profile constrains the Observation resource to represent alcohol use assessment in a patient summary.
[Observation Social History - Tobacco Use (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Observation-tobaccouse-uv-ips.html "StructureDefinition/Observation-tobaccouse-uv-ips")This profile constrains the Observation resource to represent Tobacco use assessment in a patient summary.
[Organization (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Organization-uv-ips.html "StructureDefinition/Organization-uv-ips")This profile constrains the Organization resource to represent an organization that acts as performer or observer for a result observation (laboratory, pathology or imaging), or as performer for a procedure.
[Patient (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Patient-uv-ips.html "StructureDefinition/Patient-uv-ips")This profile represents the constraints applied to the Patient resource by the International Patient Summary (IPS) FHIR Implementation Guide and describes the minimum expectations for the Patient resource when used in the IPS composition or in one of the referred resources.
[Practitioner (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Practitioner-uv-ips.html "StructureDefinition/Practitioner-uv-ips")This profile constrains the practitioner resource to represent a practitioner acting as observer for these imaging results.
[PractitionerRole (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-PractitionerRole-uv-ips.html "StructureDefinition/PractitionerRole-uv-ips")This profile constrains the PractitionerRole resource to represent a practitioner acting as observer for observation results for a specified organization.
[Procedure (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Procedure-uv-ips.html "StructureDefinition/Procedure-uv-ips")This profile represents the constraints applied to the Procedure resource by the IPS project, which specifies an entry of the History of Procedure for the international patient summary based on the FHIR standard R4.
[Specimen (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Specimen-uv-ips.html "StructureDefinition/Specimen-uv-ips")This profile constrains the Specimen resource to represent the characteristics of a biological specimens in the context of laboratory results integrated to a patient summary.

### Structures: Data Type Profiles [](https://hl7.org/fhir/uv/ips/artifacts.html#structures-data-type-profiles)

These define constraints on FHIR data types for systems conforming to this implementation guide.

[Codeable Concept (IPS)](https://hl7.org/fhir/uv/ips/en/StructureDefinition-CodeableConcept-uv-ips.html "StructureDefinition/CodeableConcept-uv-ips")This profile represents the constraint applied to the CodeableConcept data type by the International Patient Summary (IPS) FHIR Implementation Guide to use the Coding-uv-ips data type profile.
[Coding with translations](https://hl7.org/fhir/uv/ips/en/StructureDefinition-Coding-uv-ips.html "StructureDefinition/Coding-uv-ips")This profile extends the capabilities of the coding data type to support multi-language designations (display). It relies on the Translation extension.

### Terminology: Value Sets [](https://hl7.org/fhir/uv/ips/artifacts.html#terminology-value-sets)

These define sets of codes used by systems conforming to this implementation guide.

[Allergies & Intolerances - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-allergies-intolerances-uv-ips.html "ValueSet/allergies-intolerances-uv-ips")IPS allergy and intolerance codes value set. This value set includes codes from SNOMED CT®: all descendants of 373873005 |Pharmaceutical / biologic product (product)|; all descendants of 105590001 |Substance (substance)|; all descendants of 420134006 |Propensity to adverse reaction (finding)|; all descendants or self of 716186003 |No known allergy (situation)|

SNOMED CT® ECL definition:  
< 373873005 |Pharmaceutical / biologic product (product)| OR < 105590001 |Substance (substance)| OR < 420134006 |Propensity to adverse reaction (finding)| OR \<\< 716186003 |No known allergy (situation)|
[Allergy Reaction - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-allergy-reaction-uv-ips.html "ValueSet/allergy-reaction-uv-ips")IPS allergy reaction value set. This value set includes a set of SNOMED CT codes and descendants (all top level codes are included in the SNOMED CT IPS Terminology) that may be used to represent allergy or intolerance reactions.

SNOMED CT® ECL definition:  
 \<\< 4386001 |Bronchospasm (finding)| OR \<\< 9826008 |Conjunctivitis (disorder)| OR \<\< 23924001 |Tight chest (finding)| OR \<\< 24079001 |Atopic dermatitis (disorder)| OR \<\< 31996006 |Vasculitis (disorder)| OR \<\< 39579001 |Anaphylaxis (disorder)| OR \<\< 41291007 |Angioedema (disorder)| OR \<\< 43116000 |Eczema (disorder)| OR \<\< 49727002 |Cough (finding)| OR \<\< 51599000 |Edema of larynx (disorder)| OR \<\< 62315008 |Diarrhea (finding)| OR \<\< 70076002 |Rhinitis (disorder)| OR \<\< 73442001 |Stevens-Johnson syndrome (disorder)| OR \<\< 76067001 |Sneezing (finding)| OR \<\< 91175000 |Seizure (finding)| OR \<\< 126485001 |Urticaria (disorder)| OR \<\< 162290004 |Dry eyes (finding)| OR \<\< 195967001 |Asthma (disorder)| OR \<\< 247472004 |Weal (disorder)| OR \<\< 267036007 |Dyspnea (finding)| OR \<\< 271757001 |Papular eruption (disorder)| OR \<\< 271759003 |Bullous eruption (disorder)| OR \<\< 271807003 |Eruption of skin (disorder)| OR \<\< 410430005 |Cardiorespiratory arrest (disorder)| OR \<\< 418363000 |Itching of skin (finding)| OR \<\< 422400008 |Vomiting (disorder)| OR \<\< 422587007 |Nausea (finding)| OR \<\< 698247007 |Cardiac arrhythmia (disorder)| OR \<\< 702809001 |Drug reaction with eosinophilia and systemic symptoms (disorder)| OR \<\< 768962006 |Lyell syndrome (disorder)| OR \<\< 781682005 |Hyperemia of eye (finding)|
[Body Site - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-body-site-uv-ips.html "ValueSet/body-site-uv-ips")IPS body site value set. This value set includes a set of codes from SNOMED CT that may be used to represent body sites (e.g., for laboratory specimen collection). This value set includes codes from SNOMED CT®: all descendants of 442083009 |Anatomical or acquired body structure (body structure)|

SNOMED CT® ECL definition:  
< 442083009 |Anatomical or acquired body structure (body structure)|
[Current Smoking Status - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-current-smoking-status-uv-ips.html "ValueSet/current-smoking-status-uv-ips")HL7 IPS SNOMED value set for smoking status. This value set includes a set of specific SNOMED CT codes (no subtypes included) that may be used to represent smoking status.

SNOMED CT® ECL definition:  
 449868002 |Smokes tobacco daily (finding)| OR 428041000124106 |Occasional tobacco smoker (finding)| OR 8517006 |Ex-smoker (finding)| OR 266919005 |Never smoked tobacco (finding)| OR 77176002 |Smoker (finding)| OR 266927001 |Tobacco smoking consumption unknown (finding)| OR 230063004 |Heavy cigarette smoker (finding)| OR 230060001 |Light cigarette smoker (finding)|
[Diagnostics Report Status Codes - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-diagnostics-report-status-uv-ips.html "ValueSet/diagnostics-report-status-uv-ips")IPS Diagnostic Report status codes allowable for diagnostics reports. This value set includes all status codes except "entered-in-error" from http://hl7.org/fhir/diagnostic-report-status.
[Healthcare Professional Roles - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-healthcare-professional-roles-uv-ips.html "ValueSet/healthcare-professional-roles-uv-ips")IPS Healthcare Professional Roles
[Imaging Study Status Codes - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-imaging-study-status-uv-ips.html "ValueSet/imaging-study-status-uv-ips")IPS Imaging Study status codes allowable for results. section This value set includes all imaging study status codes except "entered-in-error" from http://hl7.org/fhir/imagingstudy-status.
[Medical Devices - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-medical-devices-uv-ips.html "ValueSet/medical-devices-uv-ips")IPS Medical device codes value set. This value set includes codes from SNOMED CT (SNOMED CT®) that are included in: all descendants of 49062001 |Device (physical object)|; all descendants or self of 787483001 |No known device use (situation)|

SNOMED CT® ECL definition:  
< 49062001 |Device (physical object)| OR \<\< 787483001 |No known device use (situation)|
[Medications - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-medication-uv-ips.html "ValueSet/medication-uv-ips")IPS Medication codes value set. This value set includes codes from SNOMED CT®: all descendants of 763158003 |Medicinal product (product)|; excluding the descendants or self of 787859002 |Vaccine product (medicinal product)|; including all descendants or self of 787481004 |No known medications (situation)|

SNOMED CT® ECL definition:  
 (< 763158003 |Medicinal product (product)| MINUS \<\< 787859002 |Vaccine product (medicinal product)|) OR \<\< 787481004 |No known medications (situation)|
[Medications - example (IPS)](https://hl7.org/fhir/uv/ips/en/ValueSet-medication-example-uv-ips.html "ValueSet/medication-example-uv-ips")This value set provides an example of possible medication coded concepts. This value set will be removed in a future release and has been replaced with [medication-uv-ips](https://hl7.org/fhir/uv/ips/en/ValueSet-medication-uv-ips.html).
[Medicine Active Substances - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-medicine-active-substances-uv-ips.html "ValueSet/medicine-active-substances-uv-ips")IPS Medicine active substance codes value set. This value set includes codes from SNOMED CT®: all descendants of 410942007 |Drug or medicament (substance)|

SNOMED CT® ECL definition:  
< 410942007 |Drug or medicament (substance)|\

Future implementations should consider ISO 11238 Health informatics – Identification of medicinal products – Data elements and structures for the unique identification and exchange of regulated information on substances.
[Medicine EDQM Doseform - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-medicine-doseform.html "ValueSet/medicine-doseform")While SNOMED remains a preferred binding for medicine doseform, EDQM (European Directorate for the Quality of Medicines and Healthcare) doseform codes are allowed as additional binding.

This Value Set includes all the EDQM Standard Terms having:  
 [Concept Status] = ‘C’AND  
 [Concept Class] IN (‘PDF’, ‘CMT’, ‘CDF’, ‘PFT') AND  
 [Domain] = 'H+V'

C = 'Current'; PDF = 'Pharmaceutical dose form'; CMT = 'Combined terms'; CDF = 'Combined pharmaceutical dose form'; PFT = 'Patient Friendly'; H+V = 'Human and Veterinary'
[Medicine EDQM Route of Administration - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-medicine-route-of-administration.html "ValueSet/medicine-route-of-administration")While SNOMED remains a preferred binding for medicine route, EDQM (European Directorate for the Quality of Medicines and Healthcare) route of administration codes are allowed as additional binding.

EDQM (European Directorate for the Quality of Medicines and Healthcare) Route of Administration codes. This Value Set includes all the EDQM Standard Terms having:  
 [Concept Status] = ‘C’AND  
 [Concept Class] = 'ROA' AND  
 [Domain] = 'H+V'

C = 'Current'; ROA = 'Route of administration'; H+V = 'Human and Veterinary'
[Personal Relationship - IPS [Deprecated]](https://hl7.org/fhir/uv/ips/en/ValueSet-personal-relationship-uv-ips.html "ValueSet/personal-relationship-uv-ips")The Value Set is used (optionally) to code the type of contact relationship between a person and the patient. This value set will be removed in a future release. It has been replaced with [PersonalRelationshipRoleType](https://terminology.hl7.org/3.1.0/ValueSet-v3-PersonalRelationshipRoleType.html)
[Pregnancy Expected Delivery Date Method - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-edd-method-uv-ips.html "ValueSet/edd-method-uv-ips")IPS Expected Delivery Date Method
[Pregnancy Outcome - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-pregnancies-summary-uv-ips.html "ValueSet/pregnancies-summary-uv-ips")IPS Pregnancies Summary
[Pregnancy Status - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-pregnancy-status-uv-ips.html "ValueSet/pregnancy-status-uv-ips")IPS pregnancy status codes value set. This value set includes codes from SNOMED CT®: 77386006 |Pregnant|; 60001007 |Not pregnant|; 152231000119106 |Pregnancy not yet confirmed|; 146799005 |Possible pregnancy|

SNOMED CT® ECL definition:  
 77386006 |Pregnant| OR 60001007 |Not pregnant| OR 152231000119106 |Pregnancy not yet confirmed| OR 146799005 |Possible pregnancy|
[Problem Type (LOINC)](https://hl7.org/fhir/uv/ips/en/ValueSet-problem-type-loinc.html "ValueSet/problem-type-loinc")This value set indicates the level of medical judgment used to determine the existence of a problem.
[Problem Type - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-problem-type-uv-ips.html "ValueSet/problem-type-uv-ips")This value set provides a category for the condition as a clinical problem for inclusion in the patient summary.
[Problems - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-problems-uv-ips.html "ValueSet/problems-uv-ips")IPS Problem (Condition) codes value set. This value set includes codes from SNOMED CT®: all descendants of 404684003 |Clinical finding (finding)|; all descendants of 243796009 |Situation with explicit context (situation)|; all descendants of 272379006 |Event (event)|; all descendants or self of 160245001 |No current problems or disability (situation)|. The descendants of 71388002 |Procedure (procedure)| (which were included in the CORE problem list) are not included, as they are expected to be represented separately in the History of Procedures Section.

SNOMED CT® ECL definition:  
< 404684003 |Clinical finding (finding)| OR < 243796009 |Situation with explicit context (situation)| OR < 272379006 |Event (event)| OR \<\< 160245001 |No current problems or disability (situation)|
[Procedures - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-procedures-uv-ips.html "ValueSet/procedures-uv-ips")IPS Procedure codes value set. This value set includes codes from SNOMED CT®: all descendants of 71388002 |Procedure (procedure)|; excluding [all descendants or self of 14734007 |Administrative procedure (procedure)|; all descendants or self of 59524001 |Blood bank procedure (procedure)|; all descendants or self of 389067005 |Community health procedure (procedure)|; all descendants or self of 442006003 |Determination of information related to transfusion (procedure)|; all descendants or self of 225288009 |Environmental care procedure (procedure)|; all descendants or self of 308335008 |Patient encounter procedure (procedure)|; all descendants or self of 710135002 |Promotion (procedure)|; all descendants or self of 389084004 |Staff related procedure (procedure)|]; including all descendants or self of 787480003 |No known procedures (situation)|

SNOMED CT® ECL definition:  
 (< 71388002 |Procedure (procedure)| MINUS (\<\< 14734007 |Administrative procedure (procedure)| OR \<\< 59524001 |Blood bank procedure (procedure)| OR \<\< 389067005 |Community health procedure (procedure)| OR \<\< 442006003 |Determination of information related to transfusion (procedure)| OR \<\< 225288009 |Environmental care procedure (procedure)| OR \<\< 308335008 |Patient encounter procedure (procedure)| OR \<\< 710135002 |Promotion (procedure)| OR \<\< 389084004 |Staff related procedure (procedure)|)) OR << 787480003 |No known procedures (situation)|
[Results Blood Group - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-blood-group-uv-ips.html "ValueSet/results-blood-group-uv-ips")IPS Results Blood Group value set. This value set includes codes from SNOMED CT®: all descendants of 365636006 |Finding of blood group (finding)|

SNOMED CT® ECL definition:  
< 365636006 |Finding of blood group (finding)|
[Results Coded Values Laboratory/Pathology - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-coded-values-laboratory-pathology-uv-ips.html "ValueSet/results-coded-values-laboratory-pathology-uv-ips")IPS Results Coded Values Laboratory/Pathology value set. This value set includes the codes from the [Results Blood Group - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-blood-group-uv-ips.html), [Results Presence/Absence - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-presence-absence-uv-ips.html), [Results Microorganism - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-microorganism-uv-ips.html) and [Results Pathology - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-pathology-uv-ips.html) value sets.

SNOMED CT® ECL definition:  
< 365636006 |Finding of blood group (finding)| OR < 260411009 |Presence findings (qualifier value)| OR < 272519000 |Absence findings (qualifier value)| OR < 409822003 |Domain Bacteria (organism)| OR < 441649000 |Class Cestoda and/or Class Trematoda and/or Phylum Nemata (organism)| OR < 414561005 |Kingdom Fungi (organism)| OR < 84676004 |Prion (organism)| OR < 49872002 |Virus (organism)| OR < 417396000 |Kingdom Protozoa (organism)| OR < 419036000 |Domain Archaea (organism)| OR < 426785004 |Kingdom Chromista (organism)| OR < 370570004 |Kingdom Protoctista (organism)| OR < 417377004 |Kingdom Viridiplantae (organism)| OR < 243565002 |Slime mold (organism)| OR < 106253005 |Histologic grading differentiation AND/OR behavior (qualifier value)| OR < 373369003 |Finding of histologic grading differentiation AND/OR behavior (finding)| OR < 399981008 |Neoplasm and/or hamartoma (disorder)|
[Results Laboratory/Pathology Observation - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-laboratory-pathology-observations-uv-ips.html "ValueSet/results-laboratory-pathology-observations-uv-ips")Value Set Definition: LOINC {STATUS in {ACTIVE}, CLASSTYPE in {Laboratory class (1)}, CLASS exclude {LP62148-9 (NR STATS), LP175679-2 (H&P.HX.LAB), LP7785-1 (CHALSKIN), LP94892-4 (LABORDERS)}}
[Results Microorganism - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-microorganism-uv-ips.html "ValueSet/results-microorganism-uv-ips")IPS Results Microorganism value set. This value set includes codes from SNOMED CT®: all descendants of 409822003 |Domain Bacteria (organism)|; all descendants of 441649000 |Class Cestoda and/or Class Trematoda and/or Phylum Nemata (organism)|; all descendants of 414561005 |Kingdom Fungi (organism)|; all descendants of 84676004 |Prion (organism)|; all descendants of 49872002 |Virus (organism)|; all descendants of 417396000 |Kingdom Protozoa (organism)|; all descendants of 419036000 |Domain Archaea (organism)|; all descendants of 426785004 |Kingdom Chromista (organism)|; all descendants of 370570004 |Kingdom Protoctista (organism)|; all descendants of 417377004 |Kingdom Viridiplantae (organism)|; all descendants of 243565002 |Slime mold (organism)|

SNOMED CT® ECL definition:  
< 409822003 |Domain Bacteria (organism)| OR < 441649000 |Class Cestoda and/or Class Trematoda and/or Phylum Nemata (organism)| OR < 414561005 |Kingdom Fungi (organism)| OR < 84676004 |Prion (organism)| OR < 49872002 |Virus (organism)| OR < 417396000 |Kingdom Protozoa (organism)| OR < 419036000 |Domain Archaea (organism)| OR < 426785004 |Kingdom Chromista (organism)| OR < 370570004 |Kingdom Protoctista (organism)| OR < 417377004 |Kingdom Viridiplantae (organism)| OR < 243565002 |Slime mold (organism)|
[Results Pathology - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-pathology-uv-ips.html "ValueSet/results-pathology-uv-ips")IPS Results Pathology value set. This value set includes codes from SNOMED CT®: all descendants of 106253005 |Histologic grading differentiation AND/OR behavior (qualifier value)|; all descendants of 373369003 |Finding of histologic grading differentiation AND/OR behavior (finding)|; all descendants of 399981008 |Neoplasm and/or hamartoma (disorder)|

SNOMED CT® ECL definition:  
< 106253005 |Histologic grading differentiation AND/OR behavior (qualifier value)| OR < 373369003 |Finding of histologic grading differentiation AND/OR behavior (finding)| OR < 399981008 |Neoplasm and/or hamartoma (disorder)|
[Results Presence/Absence - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-presence-absence-uv-ips.html "ValueSet/results-presence-absence-uv-ips")IPS Results Presence/Absence value set. This value set includes codes from SNOMED CT®: all descendants of 260411009 |Presence findings (qualifier value)|; all descendants of 272519000 |Absence findings (qualifier value)|

SNOMED CT® ECL definition:  
< 260411009 |Presence findings (qualifier value)| OR < 272519000 |Absence findings (qualifier value)|
[Results Radiology Component - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-radiology-component-uv-ips.html "ValueSet/results-radiology-component-uv-ips")Value set including SNOMED CT, LOINC and DICOM concepts for textual reports, measurements, and other radiology components
[Results Radiology Observation - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-radiology-observations-uv-ips.html "ValueSet/results-radiology-observations-uv-ips")Value Set Definition: LOINC {STATUS in {ACTIVE}, CLASS in LP29684-5 ("RAD")}
[Results Specimen Collection Method - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-specimen-collection-method-uv-ips.html "ValueSet/results-specimen-collection-method-uv-ips")IPS Specimen collection method codes value set. This value set includes codes from SNOMED CT®: all descendants or self of 129316008 |Aspiration - action (qualifier value)|; all descendants or self of 129314006 |Biopsy - action (qualifier value)|; all descendants or self of 129300006 |Puncture - action (qualifier value)|; all descendants or self of 129304002 |Excision - action (qualifier value)|; all descendants or self of 129323009 |Scraping - action (qualifier value)|; all descendants or self of 73416001 |Urine specimen collection, clean catch (procedure)|; all descendants or self of 225113003 |Timed urine collection (procedure)|; all descendants or self of 70777001 |Urine specimen collection, catheterized (procedure)|; all descendants or self of 386089008 |Collection of coughed sputum (procedure)|; all descendants or self of 278450005 |Finger-prick sampling (procedure)|

SNOMED CT® ECL definition:  
 \<\< 129316008 |Aspiration - action (qualifier value)| OR \<\< 129314006 |Biopsy - action (qualifier value)| OR \<\< 129300006 |Puncture - action (qualifier value)| OR \<\< 129304002 |Excision - action (qualifier value)| OR \<\< 129323009 |Scraping - action (qualifier value)| OR \<\< 73416001 |Urine specimen collection, clean catch (procedure)| OR \<\< 225113003 |Timed urine collection (procedure)| OR \<\< 70777001 |Urine specimen collection, catheterized (procedure)| OR \<\< 386089008 |Collection of coughed sputum (procedure)| OR \<\< 278450005 |Finger-prick sampling (procedure)|
[Results Specimen Type - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-specimen-type-uv-ips.html "ValueSet/results-specimen-type-uv-ips")IPS Specimen Type codes value set. This value set includes codes from SNOMED CT®: all descendants of 123038009 |Specimen (specimen)|

SNOMED CT® ECL definition:  
< 123038009 |Specimen (specimen)|
[Results Status Codes - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-results-status-uv-ips.html "ValueSet/results-status-uv-ips")IPS Observation status codes allowable for results. This value set includes all observation status codes except "entered-in-error" from http://hl7.org/fhir/observation-status.
[Vaccine Target Diseases - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-target-diseases-uv-ips.html "ValueSet/target-diseases-uv-ips")IPS Vaccine target disease codes value set. This value set includes codes from SNOMED CT that represent specific vaccine target diseases (descendant concepts, if they exist, are not included).

SNOMED CT® ECL definition:  
 4834000 |Typhoid fever (disorder)| OR 6142004 |Influenza (disorder)| OR 16541001 |Yellow fever (disorder)| OR 14189004 |Measles (disorder)| OR 14168008 |Rabies (disorder)| OR 18624000 |Disease caused by Rotavirus (disorder)| OR 23502006 |Lyme disease (disorder)| OR 23511006 |Meningococcal infectious disease (disorder)| OR 24662006 |Influenza caused by Influenza B virus (disorder)| OR 25225006 |Disease caused by Adenovirus (disorder)| OR 27836007 |Pertussis (disorder)| OR 32398004 |Bronchitis (disorder)| OR 36653000 |Rubella (disorder)| OR 36989005 |Mumps (disorder)| OR 37246009 |Disease caused by rickettsiae (disorder)| OR 38907003 |Varicella (disorder)| OR 40468003 |Viral hepatitis, type A (disorder)| OR 50711007 |Viral hepatitis type C (disorder)| OR 52947006 |Japanese encephalitis virus disease (disorder)| OR 56717001 |Tuberculosis (disorder)| OR 58750007 |Plague (disorder)| OR 63650001 |Cholera (disorder)| OR 66071002 |Viral hepatitis type B (disorder)| OR 67924001 |Smallpox (disorder)| OR 70036007 |Haemophilus influenzae pneumonia (disorder)| OR 75702008 |Brucellosis (disorder)| OR 76902006 |Tetanus (disorder)| OR 85904008 |Paratyphoid fever (disorder)| OR 111852003 |Vaccinia (disorder)| OR 186150001 |Enteritis caused by rotavirus (disorder)| OR 186772009 |Rocky Mountain spotted fever (disorder)| OR 186788009 |Q fever (disorder)| OR 240532009 |Human papillomavirus infection (disorder)| OR 240613006 |Typhus group rickettsial disease (disorder)| OR 372244006 |Malignant melanoma (disorder)| OR 397430003 |Diphtheria caused by Corynebacterium diphtheriae (disorder)| OR 398102009 |Acute poliomyelitis (disorder)| OR 398565003 |Infection caused by Clostridium botulinum (disorder)| OR 409498004 |Anthrax (disorder)| OR 417093003 |Disease caused by West Nile virus (disorder)| OR 442438000 |Influenza caused by Influenza A virus (disorder)| OR 442696006 |Influenza caused by Influenza A virus subtype H1N1 (disorder)| OR 450715004 |Influenza caused by Influenza A virus subtype H7 (disorder)| OR 707448003 |Influenza caused by Influenza A virus subtype H7N9 (disorder)| OR 709410003 |Haemophilus influenzae type b infection (disorder)| OR 712986001 |Encephalitis caused by tick-borne encephalitis virus (disorder)| OR 713083002 |Influenza caused by Influenza A virus subtype H5 (disorder)| OR 772810003 |Influenza caused by Influenza A virus subtype H3N2 (disorder)| OR 772828001 |Influenza caused by Influenza A virus subtype H5N1 (disorder)| OR 840539006 |Disease caused by severe acute respiratory syndrome coronavirus 2 (disorder)|
[Vaccines - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-vaccines-uv-ips.html "ValueSet/vaccines-uv-ips")IPS Vaccine codes value set. This value set includes codes from SNOMED CT®: all descendants of 787859002 |Vaccine product (product)|; all descendants or self of 787482006 |No known immunizations (situation)|

SNOMED CT® ECL definition:  
< 787859002 |Vaccine product (product)| OR \<\< 787482006 |No known immunizations (situation)|
[Vaccines WHO ATC - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-vaccines-whoatc-uv-ips.html "ValueSet/vaccines-whoatc-uv-ips")IPS Vaccine codes value set. This value set includes codes from the World Health Organization Anatomical Therapeutic Chemical (ATC) classification system: all descendants of J07 "VACCINES"
[WHO ATC - IPS](https://hl7.org/fhir/uv/ips/en/ValueSet-whoatc-uv-ips.html "ValueSet/whoatc-uv-ips")World Health Organization Anatomical Therapeutic Chemical (ATC) classification system.

### Example: Example Instances [](https://hl7.org/fhir/uv/ips/artifacts.html#example-example-instances)

These are example instances that show what data produced and consumed by systems conforming with this implementation guide might look like.

[AllergyIntolerance - Multiple Codings](https://hl7.org/fhir/uv/ips/en/AllergyIntolerance-allergyintolerance-multiple-codings.html "AllergyIntolerance/allergyintolerance-multiple-codings")AllergyIntolerance - Multiple Codings
[AllergyIntolerance - No Known Allergies](https://hl7.org/fhir/uv/ips/en/AllergyIntolerance-eumfh-39-07-1.html "AllergyIntolerance/eumfh-39-07-1")AllergyIntolerance - No Known Allergies
[AllergyIntolerance - Resolved Allergy](https://hl7.org/fhir/uv/ips/en/AllergyIntolerance-allergyintolerance-with-abatement.html "AllergyIntolerance/allergyintolerance-with-abatement")AllergyIntolerance - Resolved Allergy
[Bundle - IPS with All Sections](https://hl7.org/fhir/uv/ips/en/Bundle-bundle-ips-all-sections.html "Bundle/bundle-ips-all-sections")Bundle - IPS with All Sections
[Bundle - IPS with Data](https://hl7.org/fhir/uv/ips/en/Bundle-IPS-examples-Bundle-01.html "Bundle/IPS-examples-Bundle-01")Bundle - IPS with Data
[Bundle - IPS with Required Sections and Immunization](https://hl7.org/fhir/uv/ips/en/Bundle-IPS-examples-Bundle-with-immunization.html "Bundle/IPS-examples-Bundle-with-immunization")Bundle - IPS with Required Sections and Immunization
[Bundle - Minimal Complete IPS](https://hl7.org/fhir/uv/ips/en/Bundle-bundle-minimal.html "Bundle/bundle-minimal")Bundle - Minimal Complete IPS
[Bundle - No Information in Required Sections](https://hl7.org/fhir/uv/ips/en/Bundle-bundle-no-info-required-sections.html "Bundle/bundle-no-info-required-sections")Bundle - No Information in Required Sections
[Composition - Minimal Sections](https://hl7.org/fhir/uv/ips/en/Composition-composition-minimal.html "Composition/composition-minimal")Composition - Minimal Sections
[Condition - Acute Myeloid Leukemia](https://hl7.org/fhir/uv/ips/en/Condition-eumfh-39-07-1.html "Condition/eumfh-39-07-1")Condition - Acute Myeloid Leukemia
[Device - Device Observer](https://hl7.org/fhir/uv/ips/en/Device-ips-example-imaging-1.html "Device/ips-example-imaging-1")Device - Device Observer
[Device - No Known Devices in Use](https://hl7.org/fhir/uv/ips/en/Device-eumfh-70-275-1.html "Device/eumfh-70-275-1")Device - No Known Devices in Use
[DeviceUseStatement - No Known Devices in Use](https://hl7.org/fhir/uv/ips/en/DeviceUseStatement-eumfh-70-275-1.html "DeviceUseStatement/eumfh-70-275-1")DeviceUseStatement - No Known Devices in Use
[DiagnosticReport - Hemoglobin](https://hl7.org/fhir/uv/ips/en/DiagnosticReport-hemoglobin.html "DiagnosticReport/hemoglobin")DiagnosticReport - Hemoglobin
[Flag - Alert of Patient Immunocompromised](https://hl7.org/fhir/uv/ips/en/Flag-546482.html "Flag/546482")Flag - Alert of Patient Immunocompromised
[ImagingStudy - Referred DICOM Study](https://hl7.org/fhir/uv/ips/en/ImagingStudy-TII-ImagingStudy-5-1.html "ImagingStudy/TII-ImagingStudy-5-1")ImagingStudy - Referred DICOM Study
[Immunization - Vaccin anti diphtérie-coqueluche-tétanos-poliomyélite (Luxembourg)](https://hl7.org/fhir/uv/ips/en/Immunization-75680.html "Immunization/75680")Immunization - Vaccin anti diphtérie-coqueluche-tétanos-poliomyélite (Luxembourg)
[Medication - Simvastatin 40 MG Disintegrating Oral Tablet](https://hl7.org/fhir/uv/ips/en/Medication-eumfh-39-07-1.html "Medication/eumfh-39-07-1")Medication - Simvastatin 40 MG Disintegrating Oral Tablet
[MedicationRequest - Simvastatin Request](https://hl7.org/fhir/uv/ips/en/MedicationRequest-eumfh-39-07-1-request.html "MedicationRequest/eumfh-39-07-1-request")MedicationRequest - Simvastatin Request
[MedicationStatement - Ongoing Simvastatin Treatment](https://hl7.org/fhir/uv/ips/en/MedicationStatement-eumfh-39-07-1.html "MedicationStatement/eumfh-39-07-1")MedicationStatement - Ongoing Simvastatin Treatment
[Observation - Social History Alcohol Use](https://hl7.org/fhir/uv/ips/en/Observation-alcohol-use-example.html "Observation/alcohol-use-example")Observation - Social History Alcohol Use
[Observation: SH tobacco use example](https://hl7.org/fhir/uv/ips/en/Observation-tobacco-use-example.html "Observation/tobacco-use-example")Observation: SH tobacco use example
[Observation: estrogen receptor in tissue example](https://hl7.org/fhir/uv/ips/en/Observation-pathology-cancer.html "Observation/pathology-cancer")Observation: estrogen receptor in tissue example
[Observation: hemoglobin example](https://hl7.org/fhir/uv/ips/en/Observation-hemoglobin.html "Observation/hemoglobin")Observation: hemoglobin example
[Observation: imaging CT Abdomen W contrast IV](https://hl7.org/fhir/uv/ips/en/Observation-ips-example-imaging-1.html "Observation/ips-example-imaging-1")Observation: imaging CT Abdomen W contrast IV
[Observation: imaging CT Abdomen W contrast IV, sub-observations](https://hl7.org/fhir/uv/ips/en/Observation-ips-example-imaging-4.html "Observation/ips-example-imaging-4")Observation: imaging CT Abdomen W contrast IV,sub-observations
[Observation: imaging Chest X-ray - PA and lateral, with additional sub-observation including numeric range](https://hl7.org/fhir/uv/ips/en/Observation-ips-example-imaging-5.html "Observation/ips-example-imaging-5")Observation: imaging Chest X-ray - PA and lateral, with additional sub-observation including numeric range
[Observation: pathology suppressed example](https://hl7.org/fhir/uv/ips/en/Observation-pathology-suppressed-data.html "Observation/pathology-suppressed-data")Observation: pathology suppressed example
[Observation: pregnancy edd example](https://hl7.org/fhir/uv/ips/en/Observation-pregnancy-edd-example.html "Observation/pregnancy-edd-example")Observation: pregnancy edd example
[Observation: pregnancy outcome example](https://hl7.org/fhir/uv/ips/en/Observation-pregnancy-outcome-example.html "Observation/pregnancy-outcome-example")Observation: pregnancy outcome example
[Observation: pregnancy status example](https://hl7.org/fhir/uv/ips/en/Observation-pregnancy-status-example.html "Observation/pregnancy-status-example")Observation: pregnancy status example
[Observation: serum creatinine example](https://hl7.org/fhir/uv/ips/en/Observation-serum-creatinine-adult.html "Observation/serum-creatinine-adult")Observation: serum creatinine example
[Observation: urine wbc range example](https://hl7.org/fhir/uv/ips/en/Observation-urine-wbc-range.html "Observation/urine-wbc-range")Observation: urine wbc range example
[Organization - Minimal Name Only](https://hl7.org/fhir/uv/ips/en/Organization-simple-org.html "Organization/simple-org")Organization - Minimal Name Only
[Organization: example](https://hl7.org/fhir/uv/ips/en/Organization-TII-Organization1.html "Organization/TII-Organization1")Organization: example
[Organization: lab example](https://hl7.org/fhir/uv/ips/en/Organization-lab-org-example.html "Organization/lab-org-example")Best Hospital Lab Organization example
[Patient: female patient](https://hl7.org/fhir/uv/ips/en/Patient-patient-example-female.html "Patient/patient-example-female")Patient: female patient
[Patient: male patient](https://hl7.org/fhir/uv/ips/en/Patient-eumfh-39-07.html "Patient/eumfh-39-07")Patient: male patient
[Patient: minimal example](https://hl7.org/fhir/uv/ips/en/Patient-66033.html "Patient/66033")Patient: minimal example
[Practitioner example](https://hl7.org/fhir/uv/ips/en/Practitioner-eumfh-39-07.html "Practitioner/eumfh-39-07")Practitioner example
[PractitionerRole - Minimal](https://hl7.org/fhir/uv/ips/en/PractitionerRole-simple-pr.html "PractitionerRole/simple-pr")PractitionerRole - Minimal
[Procedure: Missing Data](https://hl7.org/fhir/uv/ips/en/Procedure-procedure-missing-performed.html "Procedure/procedure-missing-performed")Procedure: Missing Data
[Procedure: Surgical procedure](https://hl7.org/fhir/uv/ips/en/Procedure-eumfh-39-07-1.html "Procedure/eumfh-39-07-1")Procedure: Surgical procedure
[Specimen: example](https://hl7.org/fhir/uv/ips/en/Specimen-specimen-example-1.html "Specimen/specimen-example-1")Specimen: example
