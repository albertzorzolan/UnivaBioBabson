Title: US Core Implementation Guide v9.0.0

URL Source: https://hl7.org/fhir/us/core/

Markdown Content:
This page is part of the US Core (v9.0.0: [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use")9) based on [FHIR (HL7® FHIR® Standard) R4](http://hl7.org/fhir/R4). This is the current published version. For a full list of available versions, see the [Directory of published versions](http://hl7.org/fhir/us/core/history.html). Page versions: [R8](http://hl7.org/fhir/us/core/STU8/index.html)[R7](http://hl7.org/fhir/us/core/STU7/index.html)[R6](http://hl7.org/fhir/us/core/STU6.1/index.html)[R5](http://hl7.org/fhir/us/core/STU5.0.1/index.html)[R4](http://hl7.org/fhir/us/core/STU4/index.html)[R3](http://hl7.org/fhir/us/core/STU3.1.1/index.html)

## Home[](https://hl7.org/fhir/us/core/#home)

_Official URL_: http://hl7.org/fhir/us/core/ImplementationGuide/hl7.fhir.us.core _Version_: 9.0.0
_IG Standards status:_[Trial-use](http://hl7.org/fhir/R4/versions.html#std-process "Standard Status")[Maturity Level](https://hl7.org/fhir/us/core/changes-between-versions.html#us-core-maturity-levels): 3 _Computable Name_: USCore
_Other Identifiers:_ OID:2.16.840.1.113883.4.642.40.2

*   [Introduction](https://hl7.org/fhir/us/core/#introduction)
*   [Background](https://hl7.org/fhir/us/core/#background)
*   [How To Read This Guide](https://hl7.org/fhir/us/core/#how-to-read-this-guide)
*   [US Core Actors](https://hl7.org/fhir/us/core/#us-core-actors)
*   [US Core Profiles](https://hl7.org/fhir/us/core/#us-core-profiles)
*   [US Core FHIR RESTful interactions](https://hl7.org/fhir/us/core/#us-core-fhir-restful-interactions)

Key updates and detailed changes between this and prior versions are available on the US Core [Change Log](https://hl7.org/fhir/us/core/changes.html) and [Changes Between Versions](https://hl7.org/fhir/us/core/changes-between-versions.html) pages.

### Introduction[](https://hl7.org/fhir/us/core/#introduction)

This guide and the US Core profiles have become the foundation for US Realm FHIR implementation guides. This annual release reflects changes to [U.S. Core Data for Interoperability (USCDI)](https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi) and comments and requests from the US Realm FHIR community. (The [US Core Roadmap](https://hl7.org/fhir/us/core/us-core-roadmap.html#us-core-roadmap) page outlines this approach to yearly updates.) US Core has benefitted from testing and guidance by the Argonaut Project Team. Their feedback continues to lay the groundwork for documenting the US Core Profile design, interactions, requirements, and guidelines for patient data access and [Office of the National Coordinator for Health Information Technology (ONC)](https://healthit.gov/) Certification testing. Under the guidance of HL7 and the HL7 US Realm Steering Committee, the content will expand in future versions to meet the needs specific to the US Realm.

The US Core Implementation Guide is based on [FHIR Version R4](http://hl7.org/fhir/R4/index.html). It defines the minimum constraints on the FHIR resources to create the US Core Profiles. The elements, extensions, vocabularies, and value sets that SHALL be present are identified, and how they are used is defined. It also documents the minimum FHIR RESTful interactions for each US Core Profiles to access patient data. Establishing the "floor" of standards to promote interoperability and adoption through common implementation allows for further standards development evolution for specific use cases. There are two different ways to implement US Core:

1.   Profile Only Support: Systems may support _only_ the US Core Profiles to represent clinical information.
2.   Profile Support + Interaction Support: Systems may support _both_ the US Core Profile content structure _and_ the RESTful interactions defined for a resource.

For a detailed description of these different usages of US Core, see the [Conformance Requirements](https://hl7.org/fhir/us/core/capability-statements.html) page.

### Background[](https://hl7.org/fhir/us/core/#background)

The US Core requirements were initially developed, balloted, and published in FHIR DSTU2 as part of the ONC sponsored Data Access Framework (DAF) project. The Argonaut Data Query Implementation Guide superseded DAF and documented security and authorization and the querying of the [2015 Edition Common Clinical Data Set (CCDS)](https://www.healthit.gov/sites/default/files/ccds_reference_document_v1_1.pdf) and static documents. US Core descended directly from the Argonaut guide to support FHIR Version STU3 and eventually FHIR R4 and the ONC [U.S. Core Data for Interoperability (USCDI)](https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi). Refer to the [USCDI](https://hl7.org/fhir/us/core/uscdi.html) page which maps the US Core versions and profiles to the USCDI versions and Data Elements.

### How To Read This Guide[](https://hl7.org/fhir/us/core/#how-to-read-this-guide)

This Guide is divided into several pages, which are listed at the top of each page in the menu bar.

*   [Home](https://hl7.org/fhir/us/core/index.html): The home page provides the introduction and background for US Core.
*   [Conformance](https://hl7.org/fhir/us/core/conformance.html): These pages describe the set of rules to claim conformance to this guide 
    *   [General Requirements](https://hl7.org/fhir/us/core/general-requirements.html): This page defines requirements common to all actors and profiles used in this guide, including how CapabilityStatements are used to claim conformance.
    *   [Must Support](https://hl7.org/fhir/us/core/must-support.html): This page defines the expectations for mandatory and Must Support elements in the US Core Profiles.
    *   [Security](https://hl7.org/fhir/us/core/security.html): This page documents the general security requirements and recommendations for actors.
    *   [Requirements Table](https://hl7.org/fhir/us/core/requirements.html): These tables list the US Core Server and Client requirements defined in the US Core Implementation Guide’s narrative sections.

*   [Guidance](https://hl7.org/fhir/us/core/guidance.html): The Guidance pages document best practices and how to use the profiles and transactions defined in this guide. 
    *   [USCDI](https://hl7.org/fhir/us/core/uscdi.html): This page maps the US Core Profiles to the (USCDI) data classes and data elements.
    *   [General Guidance](https://hl7.org/fhir/us/core/general-guidance.html): This page provides guidance, definitions, and requirements common to all actors and profiles used in this guide.
    *   [Clinical Notes](https://hl7.org/fhir/us/core/clinical-notes.html): This page provides guidance on the interactions between Consumers and Producers of clinical notes.
    *   [Medication List](https://hl7.org/fhir/us/core/medication-list.html): This page provides guidance on how a patient or provider can access a patient's medications.
    *   [Basic Provenance](https://hl7.org/fhir/us/core/basic-provenance.html): This page provides implementers with important definitions to create and share the Provenance Resource.
    *   [Screening and Assessments](https://hl7.org/fhir/us/core/screening-and-assessments.html): This page documents how US Core Profiles are used to represent screenings and assessments for patient health status
    *   [Relationship With Other IGs](https://hl7.org/fhir/us/core/relationship-with-other-igs.html): This page outlines the relationship between US Core and other implementation guides, including a detailed comparison with International Patient Access (IPA) and International Patient Summary (IPS).

*   [FHIR Artifacts](https://hl7.org/fhir/us/core/artifacts.html): These pages provide detailed descriptions and formal definitions for all the FHIR objects defined in this guide. 
    *   [Profiles and Extensions](https://hl7.org/fhir/us/core/profiles-and-extensions.html): This page lists the US Core Profiles and Extensions defined in this guide to exchange quality data. 
        *   Each US Core Profile page includes a narrative description that lists all the [Mandatory](https://hl7.org/fhir/us/core/must-support.html) and [Must Support](https://hl7.org/fhir/us/core/must-support.html) data elements, profile-specific implementation guidance, and formal definitions. A "Quick Start" guide summarizes the supported search transactions for each profile. Although the guidance typically focuses on the profiled elements, it also may cover un-profiled elements to aid with implementation and certification.

    *   [Search Parameters and Operations](https://hl7.org/fhir/us/core/search-parameters-and-operations.html): This page lists the defined US Core Operations and Search Parameters used in US Core transactions.
    *   [Terminology](https://hl7.org/fhir/us/core/terminology.html): This page lists the US Core ValueSets, and CodeSystems defined for the profiles.
    *   [Capability Statements and Requirements Resources](https://hl7.org/fhir/us/core/capability-statements.html): These pages define the expected FHIR capabilities and requirements of the US Core Servers and Clients.
    *   [Examples](https://hl7.org/fhir/us/core/examples.html): This page lists all the examples used in this guide. These examples show what data produced and consumed by systems conforming with this implementation guide might look like. Every effort has been made to ensure that the examples are correct and useful, but they are not a normative part of the specification, nor fully representative of real-world examples.

*   [Downloads](https://hl7.org/fhir/us/core/downloads.html): This page provides links to downloadable artifacts.

*   [Version History](https://hl7.org/fhir/us/core/version-history.html): These pages document the changes across the versions of US Core. 
    *   [Change Log](https://hl7.org/fhir/us/core/changes.html): The Change Log lists all the updates, enhancements, clarifications, and corrections resulting from community feedback on US Core ballots and changes to align with evolving USCDI standards.
    *   [Changes Between Versions](https://hl7.org/fhir/us/core/changes-between-versions.html): This page documents the changes between US Core versions and documents some considerations when transitioning between versions of FHIR and US Core.

*   [Looking Ahead](https://hl7.org/fhir/us/core/looking-ahead.html): These pages provide a preview of the future direction of US Core 
    *   [US Core Roadmap](https://hl7.org/fhir/us/core/us-core-roadmap.html#us-core-roadmap): This page outlines the approach to adding new content to US Core.
    *   [Writing Vital Signs](https://hl7.org/fhir/us/core/writing-vital-signs.html): This page documents how to write vital sign observations using patient- and provider-facing apps.
    *   [Writing Clinical Notes](https://hl7.org/fhir/us/core/writing-clinical-notes.html): This page documents how to write clinical notes using patient- and provider-facing apps.
    *   [Patient Data Feed](https://hl7.org/fhir/us/core/patient-data-feed.html): This page documents how to use FHIR Subscriptions to be notified when events related to US Core content occur.

### US Core Actors[](https://hl7.org/fhir/us/core/#us-core-actors)

The following actors are part of the US Core IG:

#### US Core Requestor[](https://hl7.org/fhir/us/core/#us-core-requestor)

A US Core Requester is an application that initiates a data access request to retrieve patient data. The US Core Requestor is the Client in a Client-Server interaction. The terms "US Core Requestor" and "Client" are used interchangeably throughout this guide and are not meant to limit this actor to only patient and provider apps. For example, payers and other users can use the same technology. These terms are a short-hand notation for "user application".

#### US Core Responder[](https://hl7.org/fhir/us/core/#us-core-responder)

A US Core Responder is a system that responds to the data access request providing patient data. The US Core responder is the Server in a Client-Server interaction. The terms "US Core Responder", "Server", and "EHR" are used interchangeably throughout this guide and are not meant to limit this actor to electronic health record systems. For example, HIEs, care coordination platforms, population health systems, etc., can use the same technology. These terms are a short-hand notation for "interoperable healthcare platform".

### US Core Profiles[](https://hl7.org/fhir/us/core/#us-core-profiles)

Below is the list of US Core Profiles. Each profile identifies which core elements, extensions, vocabularies, and ValueSets **SHALL** be present in the resource when using this profile. Together, they promote interoperability and adoption through common implementation and provide the floor for standards development for specific use cases. See the [USCDI](https://hl7.org/fhir/us/core/uscdi.html) page, for a mapping to the U.S. Core Data for Interoperability (USCDI).

A simple narrative summary gives each profile's requirements and guidance. A formal hierarchical table presents a [logical view](http://hl7.org/fhir/R4/formats.html#table) of the content in both a differential and snapshot view, and provides references to appropriate terminologies and examples.

#### AllergyIntolerance[](https://hl7.org/fhir/us/core/#allergyintolerance)

*   [US Core AllergyIntolerance Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-allergyintolerance.html)

#### CarePlan[](https://hl7.org/fhir/us/core/#careplan)

*   [US Core CarePlan Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-careplan.html)

#### CareTeam[](https://hl7.org/fhir/us/core/#careteam)

*   [US Core CareTeam Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-careteam.html)

#### Condition[](https://hl7.org/fhir/us/core/#condition)

*   [US Core Condition Encounter Diagnosis Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-encounter-diagnosis.html)
*   [US Core Condition Problems and Health Concerns Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-problems-health-concerns.html)

#### Coverage[](https://hl7.org/fhir/us/core/#coverage)

*   [US Core Coverage Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-coverage.html)

#### Device[](https://hl7.org/fhir/us/core/#device)

*   [US Core Device Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-device.html)

#### DiagnosticReport[](https://hl7.org/fhir/us/core/#diagnosticreport)

*   [US Core DiagnosticReport Profile for Laboratory Results Reporting](https://hl7.org/fhir/us/core/StructureDefinition-us-core-diagnosticreport-lab.html)
*   [US Core DiagnosticReport Profile for Report and Note Exchange](https://hl7.org/fhir/us/core/StructureDefinition-us-core-diagnosticreport-note.html)

#### DocumentReference[](https://hl7.org/fhir/us/core/#documentreference)

*   [US Core ADI DocumentReference Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-adi-documentreference.html)
*   [US Core DocumentReference Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-documentreference.html)

#### Encounter[](https://hl7.org/fhir/us/core/#encounter)

*   [US Core Encounter Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-encounter.html)

#### FamilyMemberHistory[](https://hl7.org/fhir/us/core/#familymemberhistory)

*   [US Core FamilyMemberHistory Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-familymemberhistory.html)

#### Goal[](https://hl7.org/fhir/us/core/#goal)

*   [US Core Goal Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-goal.html)

#### Immunization[](https://hl7.org/fhir/us/core/#immunization)

*   [US Core Immunization Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-immunization.html)

#### Location[](https://hl7.org/fhir/us/core/#location)

*   [US Core Location Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-location.html)

#### Medication[](https://hl7.org/fhir/us/core/#medication)

*   [US Core Medication Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medication.html)

#### MedicationDispense[](https://hl7.org/fhir/us/core/#medicationdispense)

*   [US Core MedicationDispense Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationdispense.html)

#### MedicationRequest[](https://hl7.org/fhir/us/core/#medicationrequest)

*   [US Core MedicationRequest Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationrequest.html)

#### Observation[](https://hl7.org/fhir/us/core/#observation)

*   [US Core Average Blood Pressure Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-average-blood-pressure.html)
*   [US Core Care Experience Preference Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-care-experience-preference.html)
*   [US Core Observation ADI Documentation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-adi-documentation.html)
*   [US Core Observation Clinical Result Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-clinical-result.html)
    *   [US Core Laboratory Result Observation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-lab.html)

*   [US Core Observation Occupation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-occupation.html)
*   [US Core Observation Pregnancy Intent Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-pregnancyintent.html)
*   [US Core Observation Pregnancy Status Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-pregnancystatus.html)
*   [US Core Observation Screening Assessment Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-screening-assessment.html)
*   [US Core Observation Sexual Orientation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-sexual-orientation.html)
*   [US Core Simple Observation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-simple-observation.html)
*   [US Core Smoking Status Observation Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-smokingstatus.html)
*   [US Core Treatment Intervention Preference Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-treatment-intervention-preference.html)
*   [US Core Vital Signs Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-vital-signs.html)
    *   [US Core Pediatric BMI for Age Observation Profile](https://hl7.org/fhir/us/core/StructureDefinition-pediatric-bmi-for-age.html)
    *   [US Core Pediatric Weight for Height Observation Profile](https://hl7.org/fhir/us/core/StructureDefinition-pediatric-weight-for-height.html)
    *   [US Core Blood Pressure Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-blood-pressure.html)
    *   [US Core BMI Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-bmi.html)
    *   [US Core Body Height Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-body-height.html)
    *   [US Core Body Temperature Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-body-temperature.html)
    *   [US Core Body Weight Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-body-weight.html)
    *   [US Core Head Circumference Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-head-circumference.html)
    *   [US Core Heart Rate Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-heart-rate.html)
    *   [US Core Pulse Oximetry Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-pulse-oximetry.html)
    *   [US Core Respiratory Rate Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-respiratory-rate.html)
    *   [US Core Pediatric Head Occipital Frontal Circumference Percentile Profile](https://hl7.org/fhir/us/core/StructureDefinition-head-occipital-frontal-circumference-percentile.html)

#### Organization[](https://hl7.org/fhir/us/core/#organization)

*   [US Core Organization Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-organization.html)

#### Patient[](https://hl7.org/fhir/us/core/#patient)

*   [US Core Patient Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-patient.html)

#### Practitioner[](https://hl7.org/fhir/us/core/#practitioner)

*   [US Core Practitioner Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-practitioner.html)

#### PractitionerRole[](https://hl7.org/fhir/us/core/#practitionerrole)

*   [US Core PractitionerRole Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-practitionerrole.html)

#### Procedure[](https://hl7.org/fhir/us/core/#procedure)

*   [US Core Procedure Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-procedure.html)

#### Provenance[](https://hl7.org/fhir/us/core/#provenance)

*   [US Core Provenance Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-provenance.html)

#### QuestionnaireResponse[](https://hl7.org/fhir/us/core/#questionnaireresponse)

*   [US Core QuestionnaireResponse Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-questionnaireresponse.html)

*   [US Core RelatedPerson Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-relatedperson.html)

#### ServiceRequest[](https://hl7.org/fhir/us/core/#servicerequest)

*   [US Core ServiceRequest Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-servicerequest.html)

#### Specimen[](https://hl7.org/fhir/us/core/#specimen)

*   [US Core Specimen Profile](https://hl7.org/fhir/us/core/StructureDefinition-us-core-specimen.html)

### US Core FHIR RESTful interactions[](https://hl7.org/fhir/us/core/#us-core-fhir-restful-interactions)

For systems that support the US Core Profile content structure and the RESTful interactions defined for a resource, the requirements are formally defined in the US Core CapabilityStatements. In addition, each profile page has a _Quick Start_ Section that documents the required FHIR RESTful search and read operations. These sections demonstrate how to access a patient's clinical and administrative data:

**Example of a simple FHIR RESTful Search Transaction**

![Image 1: basic_fhir_restful_interaction.svg](https://hl7.org/fhir/us/core/basic_fhir_restful_interaction.svg)

See the FHIR specification for details on [FHIR RESTful Search API](http://hl7.org/fhir/R4/http.html#search) and the [SMART App Launch](http://hl7.org/fhir/smart-app-launch/STU2.2) for how an application gets access to a patient record.

* * *

Primary Authors: Brett Marquard, Eric Haas, Gay Dolin
