Title: International Patient Summary Implementation Guide v2.0.1

URL Source: https://hl7.org/fhir/uv/ips/

Published Time: Thu, 18 Jun 2026 19:34:29 GMT

Markdown Content:
This page is part of the International Patient Summary Implementation Guide (v2.0.1: [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use") 2) based on [FHIR (HL7® FHIR® Standard) R4](http://hl7.org/fhir/R4). This is the current published version. For a full list of available versions, see the [Directory of published versions](http://hl7.org/fhir/uv/ips/history.html)

## Home[](https://hl7.org/fhir/uv/ips/#home)

_Official URL_: http://hl7.org/fhir/uv/ips/ImplementationGuide/hl7.fhir.uv.ips _Version_: 2.0.1 Highlight text changes?
_IG Standards status:_[Trial-use](http://hl7.org/fhir/R4/versions.html#std-process "Standards Status")[Maturity Level](http://hl7.org/fhir/versions.html#maturity): 3 _Computable Name_: InternationalPatientSummaryIG

*   [Purpose](https://hl7.org/fhir/uv/ips/#purpose)
*   [Project Background](https://hl7.org/fhir/uv/ips/#project-background)
*   [Project Scope](https://hl7.org/fhir/uv/ips/#project-scope)
*   [Relationships with Other Projects and Guidelines](https://hl7.org/fhir/uv/ips/#relationships-with-other-projects-and-guidelines)
*   [Authors and Contributors](https://hl7.org/fhir/uv/ips/#authors-and-contributors)

An **International Patient Summary (IPS) document** is an electronic health record extract containing essential healthcare information about a subject of care. As specified in [ISO 27269](https://www.iso.org/standard/84639.html), it is designed for supporting the use case scenario for ‘unplanned, cross border care’, but it is not limited to it.

It is intended to be international, i.e., to provide generic solutions for global application beyond a particular region or country.

The IPS dataset is **minimal and non-exhaustive; specialty-agnostic and condition-independent; but still clinically relevant**.

The IPS document is composed by a set of robust, well-defined and potentially reusable sets of core data items (indicated as IPS library in the figure below). The tight focus of the IPS on unplanned care is in this case not a limitation, but, on the contrary, facilitates its potential re-use beyond the IPS scope.

**Figure 1: The IPS product and by-products**

![Image 1: Figure 1: The IPS product and by-products](https://hl7.org/fhir/uv/ips/en/IPS_doc_library.png)

### Purpose[](https://hl7.org/fhir/uv/ips/#purpose)

The goal of this Implementation Guide is to specify how to represent in HL7 FHIR the IPS. An alternative representation as templated HL7 CDA R2 is also provided ( see the [hl7.org site](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=483) or the [ART DECOR](https://art-decor.org/art-decor/decor-project--hl7ips-) repository). The initial focus of the IPS was the unplanned care across national borders. This specification can also be useful in local applications and supportive of planned care.

### Project Background[](https://hl7.org/fhir/uv/ips/#project-background)

Details on the project background are available in the [IPS Website](https://international-patient-summary.net/ips-links-to-standards-and-specifications/).

### Project Scope[](https://hl7.org/fhir/uv/ips/#project-scope)

As specified in ISO 27269, the IPS dataset is a **_"minimal, non-exhaustive set of data elements required for the international patient summary"_**. A Patient Summary is defined by ISO/TR 12773-1:2009 as a _"Health record extract comprising a standardized collection of clinical and contextual information (retrospective, concurrent, prospective) that provides a snapshot in time of a subject of care’s health information and healthcare."_

As a further definition of terms in ISO 27269, _"'Minimal' reflects the ideas of 'summary' and the need to be concise, but also alludes to the existence of a core set of data elements that all health care professionals can use; it is intended to be a speciality agnostic and condition independent set. It does not imply that all the items in the data set will be used in every summary. It is also possible to refine the extract from a record such that the content of the summary is more relevant to a particular condition (e.g. asthma) but no asthma-specific elements will be specified in this standard. The IPS Document or IPS can be extended by non-IPS standard condition-specific data._

_'Non-exhaustive' recognizes that the ideal data set is not closed, and is likely to be extended, not just in terms of requirement evolution, but also pragmatically in instances of use."_

Furthermore, the scope of the IPS is global. Although this is a major challenge, this implementation guide takes various experiences and newer developments (e.g. [US Core Implementation Guide (FHIR IG)](http://hl7.org/fhir/us/core/history.html)) into account to address, as far as possible, global feasibility.

The following picture provides an overview of the current IPS content.

**Figure 2: The IPS composition**

![Image 2: Figure 2: The IPS composition](https://hl7.org/fhir/uv/ips/en/IPS_composition.png)

### Relationships with Other Projects and Guidelines[](https://hl7.org/fhir/uv/ips/#relationships-with-other-projects-and-guidelines)

We anticipate that jurisdictions will profile based on the IPS Implementation Guide. Those guides should state if their profiles conform to IPS **OR** if any jurisdictional profile requirements conflict with the IPS. Differences in requirements should be described with respect to document constraints and actor obligations. Jurisdictional adaptations of the IPS may introduce additional profile and conformance constraints (i.e. every document that conforms to the jurisdictional profile will inherently conform to IPS, but IPS documents from another region may not conform to that jurisdictional profile).

Alignments of IPS to other FHIR guides are discussed in the [Dependencies and Related Guides](https://hl7.org/fhir/uv/ips/en/About.html#dependencies-and-related-guides). Further details on the IPS project relationships with other projects and guidelines are available in the [IPS Website](https://international-patient-summary.net/).

### Authors and Contributors[](https://hl7.org/fhir/uv/ips/#authors-and-contributors)

| Role | Name | Organization | Contact |
| --- | --- | --- | --- |
| **Primary Editor** | Rob Hausam | Hausam Consulting LLC | rob@hausamconsulting.com |
| **Primary Editor** | John D'Amore | More Informatics | johnd@moreinformatics.com |
| **Primary Editor** | Giorgio Cangioli | Consultant, HL7 Italy | giorgio.cangioli@gmail.com |
| **Contributor** | Catherine Chronaki | HL7 International Foundation | chronaki@gmail.com |
| **Contributor** | Dr Christof Geßner | Gematik | christof.gessner@gematik.de |
| **Contributor** | François Macary | Phast | francois.macary@phast.fr |
| **Contributor** | Gary Dickinson | CentriHealth | gary.dickinson@ehr-standards.com |
| **Contributor** | George Dixon | Allscripts | george.dixon@allscripts.com |
| **Contributor** | John Moehrke | Moehrke Research | JohnMoehrke@gmail.com |
| **Contributor** | Dr Kai U. Heitmann | Heitmann Consulting and Services, ART-DECOR Open Tools GmbH, HL7 Germany | info@kheitmann.de |
| **Contributor** | Kenneth Sinn | Canada Health Infoway | ksinn@infoway-inforoute.ca |
| **Contributor** | Sheridan Cook | Accenture | sheridan.cook@accenture.com |
| **Contributor** | Heath Frankel | Intervise | heath@intervise.com.au |
| **Contributor** | James Jahns | Epic | jjahns@epic.com |
